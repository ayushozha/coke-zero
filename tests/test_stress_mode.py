"""Tests for stress-mode degradation (Phase 4).

Stress mode is a runtime toggle: blocked input domains drop signals at
fusion (with a trace), and attribution confidence is haircut for
anomalies whose critical input domains are blocked.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from halo.services.attrib import AttribService
from halo.services.bus import InProcessBus
from halo.services.fusion import FusionService
from halo.services.kb import KB
from halo.services.llm.stub import StubLLMClient
from halo.services.schemas.events import (
    Anomaly,
    Attribution,
    Location,
    Provenance,
    ReasoningTrace,
    Signal,
)
from halo.services.traces import Tracer

ROOT = Path(__file__).resolve().parent.parent
KB_FILE = ROOT / "data" / "kb_seed_entries.json"


def _signal(domain: str = "pnt") -> Signal:
    return Signal(
        domain=domain,
        source="test",
        realism="mock_operational",
        confidence=0.9,
        location=Location(label="t"),
        payload={"event_type": "pnt_spoofing", "summary": "spoof"},
        provenance=Provenance(source_id="t"),
    )


def _anomaly(kind: str = "gnss_spoof") -> Anomaly:
    return Anomaly(
        kind=kind,
        source_signal="sig-1",
        source_signal_ids=["sig-1"],
        severity=0.8,
        payload={},
    )


@pytest.mark.asyncio
async def test_fusion_drops_blocked_domain_and_emits_stress_trace():
    bus = InProcessBus()
    tracer = Tracer(bus)
    blocked = {"pnt"}
    fusion = FusionService(
        bus, tracer=tracer, blocked_domains=lambda: blocked
    )

    stress_traces: list[ReasoningTrace] = []
    anomalies: list[Anomaly] = []

    async def consume_traces() -> None:
        async for _, event in bus.subscribe("traces.stress"):
            assert isinstance(event, ReasoningTrace)
            stress_traces.append(event)
            break

    async def consume_anomalies() -> None:
        async for _, event in bus.subscribe("anomalies.*"):
            if isinstance(event, Anomaly):
                anomalies.append(event)

    trace_task = asyncio.create_task(consume_traces())
    anom_task = asyncio.create_task(consume_anomalies())
    runner = asyncio.create_task(fusion.run())
    await asyncio.sleep(0)

    await bus.publish("signals.pnt", _signal("pnt"))
    await asyncio.wait_for(trace_task, timeout=1.0)
    await asyncio.sleep(0.1)  # give the fusion path a chance to emit

    runner.cancel()
    anom_task.cancel()
    for t in (runner, anom_task):
        try:
            await t
        except asyncio.CancelledError:
            pass

    # The blocked-domain trace fired.
    assert stress_traces[0].stage == "stress"
    assert "pnt" in stress_traces[0].message
    # No anomalies should have been emitted because the signal was dropped.
    assert anomalies == []


@pytest.mark.asyncio
async def test_attrib_applies_confidence_haircut_when_critical_domain_blocked():
    kb = KB.load_from_json(KB_FILE)
    bus = InProcessBus()
    tracer = Tracer(bus)
    llm = StubLLMClient(kb)
    blocked = {"pnt"}  # gnss_spoof anomaly's critical domain
    attrib = AttribService(
        bus,
        llm,
        kb,
        window_s=0.0,
        tracer=tracer,
        blocked_domains=lambda: blocked,
    )

    received: list[Attribution] = []

    async def consume() -> None:
        async for _, event in bus.subscribe("attributions.*"):
            if isinstance(event, Attribution):
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

    final = received[0]
    # Without haircut, gnss_spoof primary is 0.78, redteam delta = -0.06,
    # → 0.72. With pnt blocked the attrib service applies an additional
    # 0.15 haircut → ~0.57.
    assert final.confidence < 0.7
    assert any("Stress" in line for line in final.evidence)
