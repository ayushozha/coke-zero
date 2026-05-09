from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from coke_zero.services.bus import InProcessBus
from coke_zero.services.ids import base_signal_id
from coke_zero.services.mission_watch import MissionWatchService
from coke_zero.services.scenario_replay import load_scenario_signals
from coke_zero.services.schemas.events import ReasoningTrace, Signal
from coke_zero.services.traces import Tracer

ROOT = Path(__file__).resolve().parent.parent
SCENARIO = ROOT / "scenarios" / "beat2.jsonl"


async def _collect(bus: InProcessBus, pattern: str, target: list, limit: int) -> None:
    async for _, event in bus.subscribe(pattern):
        target.append(event)
        if len(target) >= limit:
            break


@pytest.mark.asyncio
async def test_mission_watch_cycle_tags_signals_and_emits_autonomous_traces():
    bus = InProcessBus()
    tracer = Tracer(bus)
    signals: list[Signal] = []
    traces: list[ReasoningTrace] = []
    expected_signals = len(load_scenario_signals(SCENARIO))

    signal_task = asyncio.create_task(
        _collect(bus, "signals.*", signals, expected_signals)
    )
    trace_task = asyncio.create_task(_collect(bus, "traces.watch", traces, 3))
    await asyncio.sleep(0)

    watch = MissionWatchService(
        bus,
        SCENARIO,
        speed=1000.0,
        max_delay_s=0.0,
        cycles=1,
        tracer=tracer,
        run_id_factory=lambda: "test-run",
    )
    result = await watch.run_cycle()
    await asyncio.wait_for(signal_task, timeout=1.0)
    await asyncio.wait_for(trace_task, timeout=1.0)

    assert result.status == "ok"
    assert result.run_id == "test-run"
    assert result.signals_published == expected_signals
    assert signals
    assert all(signal.id.endswith("__watch_test-run") for signal in signals)
    assert base_signal_id(signals[0].id) == load_scenario_signals(SCENARIO)[0].id
    assert signals[0].payload.observables is not None
    watch_meta = signals[0].payload.observables["mission_watch"]
    assert watch_meta["autonomous"] is True
    assert watch_meta["run_id"] == "test-run"
    assert any(trace.stage == "watch" for trace in traces)
    assert any("autonomous mission watch cycle" in trace.message for trace in traces)

    bus.close()


@pytest.mark.asyncio
async def test_mission_watch_failure_emits_warning_without_signals():
    bus = InProcessBus()
    tracer = Tracer(bus)
    signals: list[Signal] = []
    traces: list[ReasoningTrace] = []

    signal_task = asyncio.create_task(_collect(bus, "signals.*", signals, 1))
    trace_task = asyncio.create_task(_collect(bus, "traces.watch", traces, 1))
    await asyncio.sleep(0)

    watch = MissionWatchService(
        bus,
        ROOT / "scenarios" / "missing.jsonl",
        speed=1000.0,
        max_delay_s=0.0,
        cycles=1,
        tracer=tracer,
        run_id_factory=lambda: "bad-run",
    )
    result = await watch.run_cycle()
    await asyncio.wait_for(trace_task, timeout=1.0)
    signal_task.cancel()
    await asyncio.gather(signal_task, return_exceptions=True)

    assert result.status == "error"
    assert result.run_id == "bad-run"
    assert result.signals_published == 0
    assert signals == []
    assert traces[0].stage == "watch"
    assert traces[0].level == "warn"
    assert "failed" in traces[0].message

    bus.close()
