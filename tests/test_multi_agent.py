"""Tests for the multi-agent attribution pipeline (Phase 2).

Verifies that the stub StubLLMClient implements primary, redteam, and
reconcile, and that the AttribService orchestrates all three and emits
traces for each stage.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from coke_zero.services.attrib import AttribService
from coke_zero.services.bus import InProcessBus
from coke_zero.services.kb import KB
from coke_zero.services.llm.stub import StubLLMClient
from coke_zero.services.schemas.events import (
    Anomaly,
    Attribution,
    AttributionChallenge,
    ReasoningTrace,
)
from coke_zero.services.traces import Tracer

ROOT = Path(__file__).resolve().parent.parent
KB_FILE = ROOT / "data" / "kb_seed_entries.json"


def _anomaly(kind: str = "orbital_rpo_risk", severity: float = 0.85) -> Anomaly:
    return Anomaly(
        kind=kind,
        source_signal="sig-1",
        source_signal_ids=["sig-1"],
        severity=severity,
        payload={"summary": "test anomaly"},
    )


@pytest.mark.asyncio
async def test_stub_redteam_lowers_confidence():
    kb = KB.load_from_json(KB_FILE)
    llm = StubLLMClient(kb)
    anomalies = [_anomaly("orbital_rpo_risk")]

    primary = await llm.attribute_primary(anomalies)
    assert isinstance(primary, Attribution)
    assert primary.confidence > 0.5

    challenge = await llm.attribute_redteam(primary, anomalies)
    assert isinstance(challenge, AttributionChallenge)
    assert challenge.primary_attribution_id == primary.id
    assert challenge.confidence_delta < 0  # red-team should push down

    final = await llm.reconcile(primary, challenge, anomalies)
    assert final.confidence < primary.confidence
    assert final.confidence >= 0.49  # uncertainty floor holds
    # Reconciler appends the rationale to the evidence chain.
    assert any("Red-team review" in line for line in final.evidence)


@pytest.mark.asyncio
async def test_attrib_service_emits_three_stage_traces():
    kb = KB.load_from_json(KB_FILE)
    bus = InProcessBus()
    tracer = Tracer(bus)
    llm = StubLLMClient(kb)
    attrib = AttribService(bus, llm, kb, window_s=0.0, tracer=tracer)

    stages_seen: list[str] = []

    async def consume() -> None:
        async for _, event in bus.subscribe("traces.*"):
            assert isinstance(event, ReasoningTrace)
            stages_seen.append(event.stage)
            if len(stages_seen) >= 3:
                break

    consumer = asyncio.create_task(consume())
    runner = asyncio.create_task(attrib.run())
    await asyncio.sleep(0)

    await bus.publish("anomalies.orbital_rpo_risk", _anomaly())
    await asyncio.wait_for(consumer, timeout=2.0)

    runner.cancel()
    try:
        await runner
    except asyncio.CancelledError:
        pass

    # All three attrib stages should fire in order.
    assert "attrib_primary" in stages_seen
    assert "attrib_redteam" in stages_seen
    assert "attrib_reconcile" in stages_seen


@pytest.mark.asyncio
async def test_attrib_publishes_only_final_attribution():
    kb = KB.load_from_json(KB_FILE)
    bus = InProcessBus()
    tracer = Tracer(bus)
    llm = StubLLMClient(kb)
    attrib = AttribService(bus, llm, kb, window_s=0.0, tracer=tracer)

    received: list[Attribution] = []

    async def consume() -> None:
        async for _, event in bus.subscribe("attributions.*"):
            assert isinstance(event, Attribution)
            received.append(event)
            break

    consumer = asyncio.create_task(consume())
    runner = asyncio.create_task(attrib.run())
    await asyncio.sleep(0)

    await bus.publish("anomalies.gnss_spoof", _anomaly("gnss_spoof"))
    await asyncio.wait_for(consumer, timeout=2.0)

    runner.cancel()
    try:
        await runner
    except asyncio.CancelledError:
        pass

    # Only the final reconciled attribution should hit the bus — primary
    # and challenge should live entirely in the trace stream.
    assert len(received) == 1
    final = received[0]
    # Reconciliation adds a "Red-team review" line to evidence.
    assert any("Red-team" in line for line in final.evidence)
