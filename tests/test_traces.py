"""Tests for the reasoning trace fanout (Phase 1)."""
from __future__ import annotations

import asyncio

import pytest

from halo.services.bus import InProcessBus
from halo.services.fusion import FusionService
from halo.services.schemas.events import (
    Location,
    Provenance,
    ReasoningTrace,
    Signal,
)
from halo.services.traces import Tracer


def _signal() -> Signal:
    return Signal(
        domain="rf_ew",
        source="test",
        realism="mock_operational",
        confidence=0.9,
        location=Location(label="test"),
        payload={"event_type": "rf_interference", "summary": "test"},
        provenance=Provenance(source_id="t"),
    )


@pytest.mark.asyncio
async def test_tracer_publishes_to_traces_topic():
    bus = InProcessBus()
    tracer = Tracer(bus)

    received: list[tuple[str, ReasoningTrace]] = []

    async def consume() -> None:
        async for topic, event in bus.subscribe("traces.*"):
            assert isinstance(event, ReasoningTrace)
            received.append((topic, event))
            if len(received) >= 2:
                break

    consumer = asyncio.create_task(consume())
    await asyncio.sleep(0)

    await tracer.emit("fusion", "info", "first line", ref_id="anom-1")
    await tracer.emit("decide", "decision", "approved", ref_id="dec-1", actor="test")

    await asyncio.wait_for(consumer, timeout=1.0)

    assert received[0][0] == "traces.fusion"
    assert received[0][1].stage == "fusion"
    assert received[0][1].message == "first line"
    assert received[0][1].ref_id == "anom-1"

    assert received[1][0] == "traces.decide"
    assert received[1][1].level == "decision"
    assert received[1][1].payload == {"actor": "test"}


@pytest.mark.asyncio
async def test_fusion_emits_trace_per_anomaly():
    bus = InProcessBus()
    tracer = Tracer(bus)
    fusion = FusionService(bus, tracer=tracer)

    traces: list[ReasoningTrace] = []

    async def consume_traces() -> None:
        async for _, event in bus.subscribe("traces.fusion"):
            assert isinstance(event, ReasoningTrace)
            traces.append(event)
            if traces:
                break

    consumer = asyncio.create_task(consume_traces())
    runner = asyncio.create_task(fusion.run())
    await asyncio.sleep(0)

    await bus.publish("signals.rf_ew", _signal())

    await asyncio.wait_for(consumer, timeout=1.0)

    runner.cancel()
    try:
        await runner
    except asyncio.CancelledError:
        pass

    assert len(traces) >= 1
    trace = traces[0]
    assert trace.stage == "fusion"
    assert "anomaly" in trace.message
    assert trace.ref_id is not None
