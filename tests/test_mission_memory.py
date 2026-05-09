from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from pathlib import Path

import pytest

from coke_zero.services.bus import InProcessBus
from coke_zero.services.mission_memory import (
    MissionMemoryService,
    MissionMemoryStore,
    ui_event_memory_signature,
)
from coke_zero.services.schemas.events import (
    Location,
    OperatorAction,
    Provenance,
    ReasoningTrace,
    Recommendation,
    Signal,
    UIEvent,
)
from coke_zero.services.traces import Tracer


def _signal(sig_id: str = "sig-memory-001") -> Signal:
    return Signal(
        id=sig_id,
        ts=datetime(2026, 5, 9, 20, 0, tzinfo=UTC),
        domain="rf_ew",
        source="test",
        realism="mock_operational",
        confidence=0.82,
        location=Location(label="test"),
        payload={"event_type": "rf_interference", "summary": "RF drift"},
        provenance=Provenance(source_id="test-source"),
    )


def _ui_event(event_id: str = "uievt-memory-001") -> UIEvent:
    return UIEvent(
        id=event_id,
        type="recommendation_created",
        timestamp=datetime(2026, 5, 9, 20, 1, tzinfo=UTC),
        severity="high",
        title="Active defense escort recommended",
        message="Recommend escort.",
        confidence=0.83,
        source_signal_ids=["sig-memory-001__watch_run-a"],
        recommendation=Recommendation(
            id="rec-memory-001",
            summary="Approve escort package",
            approveLabel="APPROVE",
        ),
    )


async def _collect_memory_trace(
    bus: InProcessBus, target: list[ReasoningTrace], limit: int
) -> None:
    async for _, event in bus.subscribe("traces.memory"):
        if isinstance(event, ReasoningTrace):
            target.append(event)
            if len(target) >= limit:
                break


@pytest.mark.asyncio
async def test_mission_memory_persists_across_service_restarts(tmp_path: Path):
    memory_path = tmp_path / "mission_memory.json"
    bus = InProcessBus()
    tracer = Tracer(bus)
    store = MissionMemoryStore.load(memory_path)
    service = MissionMemoryService(bus, store, tracer=tracer)
    task = asyncio.create_task(service.run())
    await asyncio.sleep(0.01)

    event = _ui_event()
    signature = ui_event_memory_signature(event)
    await bus.publish("signals.rf_ew", _signal())
    await bus.publish("ui_events.recommendation_created", event)
    await service.record_operator_action_event(
        OperatorAction(
            status="approved",
            subject_kind="ui_event",
            subject_signature=signature,
            event_id=event.id,
            event_type=event.type,
            recommendation_id=event.recommendation.id,
            title=event.title,
            summary=event.recommendation.summary,
            source_signal_ids=event.source_signal_ids,
        )
    )
    await tracer.emit(
        "watch",
        "decision",
        "autonomous mission watch cycle run-a published 1 signals",
        ref_id="run-a",
        run_id="run-a",
        scenarios=["beat2.jsonl"],
        signals_published=1,
    )
    await asyncio.sleep(0.05)
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)
    bus.close()

    restarted = MissionMemoryStore.load(memory_path)
    assert restarted.state.prior_alerts
    assert restarted.state.operator_actions[signature].status == "approved"
    assert restarted.state.watch_windows["run-a"].status == "ok"
    assert restarted.state.risk_baselines
    assert restarted.state.source_timestamps["test-source"].signal_count == 1


@pytest.mark.asyncio
async def test_repeated_alert_emits_memory_hit_trace(tmp_path: Path):
    memory_path = tmp_path / "mission_memory.json"
    first_store = MissionMemoryStore.load(memory_path)
    event = _ui_event()
    signature = ui_event_memory_signature(event)
    first_store.record_ui_event(event)
    first_store.record_operator_action(
        OperatorAction(
            status="dismissed",
            subject_kind="ui_event",
            subject_signature=signature,
            event_id=event.id,
            event_type=event.type,
            title=event.title,
            summary=event.recommendation.summary,
            source_signal_ids=event.source_signal_ids,
        )
    )
    first_store.save()

    bus = InProcessBus()
    tracer = Tracer(bus)
    service = MissionMemoryService(
        bus, MissionMemoryStore.load(memory_path), tracer=tracer
    )
    traces: list[ReasoningTrace] = []
    trace_task = asyncio.create_task(_collect_memory_trace(bus, traces, 3))
    service_task = asyncio.create_task(service.run())
    await asyncio.sleep(0.01)

    await bus.publish("ui_events.recommendation_created", _ui_event("uievt-repeat"))
    await asyncio.wait_for(trace_task, timeout=1.0)

    assert any("prior alert" in trace.message for trace in traces)
    assert any("previously dismissed" in trace.message for trace in traces)

    service_task.cancel()
    await asyncio.gather(service_task, return_exceptions=True)
    bus.close()


def test_invalid_mission_memory_recreates_safe_defaults(tmp_path: Path):
    memory_path = tmp_path / "mission_memory.json"
    memory_path.write_text("{not valid json", encoding="utf-8")

    store = MissionMemoryStore.load(memory_path)

    assert store.warning is not None
    assert store.summary()["prior_alerts"] == 0
    assert store.summary()["operator_actions"] == 0
    assert memory_path.read_text(encoding="utf-8").startswith("{")
