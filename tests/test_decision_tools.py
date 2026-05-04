"""Tests for the decide-stage tool surface (Phase 3)."""
from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from canopy.services.bus import InProcessBus
from canopy.services.decide.tools import (
    KBLookupTool,
    OrbitSimulateManeuverTool,
    RequestDraftTool,
    RoutingValidateTool,
    ToolContext,
    build_tool_registry,
    dispatch,
)
from canopy.services.kb import KB
from canopy.services.orbit import OrbitService
from canopy.services.schemas.events import ReasoningTrace
from canopy.services.traces import Tracer

ROOT = Path(__file__).resolve().parent.parent
KB_FILE = ROOT / "data" / "kb_seed_entries.json"


def _ctx(tracer: Tracer | None = None) -> ToolContext:
    return ToolContext(
        kb=KB.load_from_json(KB_FILE),
        orbit=OrbitService(),
        tracer=tracer,
    )


@pytest.mark.asyncio
async def test_build_tool_registry_returns_five_tools():
    kb = KB.load_from_json(KB_FILE)
    orbit = OrbitService()
    ctx, tools = build_tool_registry(kb=kb, orbit=orbit, tracer=None)
    names = sorted(t.name for t in tools)
    assert names == [
        "kb.lookup",
        "orbit.compute_close_approach",
        "orbit.simulate_maneuver",
        "request.draft",
        "routing.validate",
    ]
    assert ctx.kb is kb
    assert ctx.orbit is orbit


@pytest.mark.asyncio
async def test_kb_lookup_returns_entries_for_known_actor():
    tool = KBLookupTool()
    ctx = _ctx()
    result = await tool.execute({"actor": "China"}, ctx)
    assert result["count"] >= 0
    assert isinstance(result["entries"], list)


@pytest.mark.asyncio
async def test_orbit_simulate_maneuver_returns_post_miss():
    tool = OrbitSimulateManeuverTool()
    ctx = _ctx()
    sat = ctx.orbit.known_satellites()[0]
    result = await tool.execute(
        {"sat": sat, "pre_miss_km": 8.0}, ctx
    )
    assert "post_miss_km" in result
    assert "dv_m_s" in result
    # CW math should widen the miss given a valid Δv.
    assert result["post_miss_km"] >= result["pre_miss_km"]


@pytest.mark.asyncio
async def test_request_draft_assembles_packet_with_burn():
    tool = RequestDraftTool()
    ctx = _ctx()
    result = await tool.execute(
        {
            "actor": "China",
            "confidence": 0.71,
            "justification": ["evidence one", "evidence two"],
            "kb_citations": ["kb-foo"],
            "burn": {
                "sat": "FRIENDLY",
                "against": "INSPECTOR",
                "dv_m_s": 1.5,
                "t_burn": "2026-06-18T12:00:00Z",
                "lead_seconds": 21600,
            },
        },
        ctx,
    )
    packet = result["request_packet"]
    assert packet["to"] == "CJFSCC"
    assert packet["actor"] == "China"
    assert "recommended_burn" in packet
    assert packet["recommended_burn"]["sat"] == "FRIENDLY"


@pytest.mark.asyncio
async def test_routing_validate_rejects_local_strike():
    tool = RoutingValidateTool()
    ctx = _ctx()
    bad = await tool.execute(
        {"action": "active_defense_escort", "authority": "local"}, ctx
    )
    assert bad["valid"] is False
    assert "requires authority=request" in bad["reason"]

    good = await tool.execute(
        {"action": "active_defense_escort", "authority": "request"}, ctx
    )
    assert good["valid"] is True


@pytest.mark.asyncio
async def test_dispatch_emits_tools_trace():
    bus = InProcessBus()
    tracer = Tracer(bus)
    ctx = _ctx(tracer=tracer)

    received: list[ReasoningTrace] = []

    async def consume() -> None:
        async for _, event in bus.subscribe("traces.tools"):
            assert isinstance(event, ReasoningTrace)
            received.append(event)
            break

    consumer = asyncio.create_task(consume())
    await asyncio.sleep(0)

    tool = RoutingValidateTool()
    await dispatch(
        tool,
        {"action": "passive_defense", "authority": "local"},
        ctx,
        ref_id="dec-test",
    )

    await asyncio.wait_for(consumer, timeout=1.0)
    assert received[0].stage == "tools"
    assert received[0].level == "tool"
    assert "routing.validate" in received[0].message
    assert received[0].ref_id == "dec-test"
