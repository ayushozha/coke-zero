"""Verify the decide-stage tool surface end-to-end.

Replays a scenario through the engine in-process (no WebSocket, no UI),
captures every ``traces.tools`` event the dispatch layer emits, and
prints each tool call with its inputs, output summary, and full result
JSON. This is the most direct way to confirm that:

* the LLM (stub or live) actually selects each tool
* the orbit math is real Skyfield SGP4 / Clohessy-Wiltshire (you can
  see the numbers come out of the math, not from a template)
* the tool path is wired into the demo scenarios you'd show judges

Usage:

    uv run python scripts/demo_tools.py
    uv run python scripts/demo_tools.py --scenario army_multidomain_attack_chain.jsonl
    uv run python scripts/demo_tools.py --provider anthropic
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv  # noqa: E402

from canopy._engine import build_engine, start_engine_tasks  # noqa: E402
from canopy.services.scenario_replay import ScenarioReplayService  # noqa: E402
from canopy.services.schemas.events import (  # noqa: E402
    Attribution,
    Decision,
    ReasoningTrace,
)

ROOT = Path(__file__).resolve().parent.parent
SCENARIOS_DIR = ROOT / "scenarios"
PER_SCENARIO_TIMEOUT = 90.0
DRAIN_S = 6.0

# Tools that the orbit-enriched action path is supposed to invoke.
EXPECTED_TOOLS = (
    "kb.lookup",
    "orbit.compute_close_approach",
    "orbit.simulate_maneuver",
    "request.draft",
    "routing.validate",
)

log = logging.getLogger(__name__)


def _short(value, max_len=80):
    s = json.dumps(value, default=str) if not isinstance(value, str) else value
    return s if len(s) <= max_len else s[: max_len - 1] + "…"


async def _drive(scenario: Path, *, provider: str) -> dict:
    captured = {
        "tool_traces": [],
        "trace_stages": {},
        "attribution": None,
        "decision": None,
    }

    engine = build_engine(provider=provider, attrib_window_s=0.5)
    tasks = start_engine_tasks(engine)

    async def consume_traces():
        async for _, event in engine.bus.subscribe("traces.*"):
            if isinstance(event, ReasoningTrace):
                captured["trace_stages"][event.stage] = (
                    captured["trace_stages"].get(event.stage, 0) + 1
                )
                if event.stage == "tools":
                    captured["tool_traces"].append(event)

    async def consume_attr():
        async for _, event in engine.bus.subscribe("attributions.*"):
            if isinstance(event, Attribution):
                captured["attribution"] = event

    async def consume_dec():
        async for _, event in engine.bus.subscribe("decisions.*"):
            if isinstance(event, Decision):
                captured["decision"] = event

    consumers = [
        asyncio.create_task(consume_traces()),
        asyncio.create_task(consume_attr()),
        asyncio.create_task(consume_dec()),
    ]

    replay_done = asyncio.Event()
    replay = ScenarioReplayService(
        engine.bus,
        scenario,
        speed=10000.0,
        max_delay_s=0.0,
        stop_when_done=replay_done,
    )
    replay_task = asyncio.create_task(replay.run())

    try:
        await asyncio.wait_for(replay_done.wait(), timeout=PER_SCENARIO_TIMEOUT)
    except asyncio.TimeoutError:
        log.warning("replay timed out for %s", scenario.name)

    deadline = asyncio.get_event_loop().time() + DRAIN_S
    while asyncio.get_event_loop().time() < deadline:
        if captured["decision"] and captured["tool_traces"]:
            break
        await asyncio.sleep(0.1)

    replay_task.cancel()
    for c in consumers:
        c.cancel()
    for t in tasks:
        t.cancel()
    await asyncio.gather(replay_task, *consumers, *tasks, return_exceptions=True)
    engine.bus.close()

    return captured


def _print_report(scenario: str, provider: str, captured: dict) -> int:
    tool_traces = captured["tool_traces"]
    decision = captured["decision"]

    print()
    print("=" * 78)
    print(f"  Scenario: {scenario}    LLM provider: {provider}")
    print("=" * 78)

    if decision is None:
        print("  No decision was produced. Engine never reached the decide stage.")
        return 1

    print(f"  Decision : action={decision.action} authority={decision.authority}")
    print(f"  Target   : {decision.target}")
    print()

    stages = captured["trace_stages"]
    if stages:
        order = ["fusion", "attrib_primary", "attrib_redteam", "attrib_reconcile",
                 "decide", "tools", "stress"]
        print("  Trace stage counts:")
        for stage in order:
            count = stages.get(stage, 0)
            if count:
                print(f"    {stage:<20} × {count}")
        print()

    if not tool_traces:
        print(
            "  NO TOOL CALLS recorded for this scenario.\n"
            "  This is expected when the decision authority is 'local' or the\n"
            "  action class is outside the orbit-enriched set\n"
            "  (active_defense_escort / _counterattack / orbital_strike_request)\n"
            "  AND when the cluster lacks an orbital_rpo_risk anomaly. Try\n"
            "  'beat47.jsonl' to exercise the full tool path."
        )
        return 0

    print(f"  Tool calls fired ({len(tool_traces)}):")
    print()
    seen_tools: set[str] = set()
    for i, trace in enumerate(tool_traces, start=1):
        payload = trace.payload or {}
        tool_name = payload.get("tool", "?")
        seen_tools.add(tool_name)
        args = payload.get("args", {})
        result = payload.get("result", {})

        print(f"  [{i}] {tool_name}")
        print(f"        args   : {_short(args, 92)}")
        print(f"        result : {_short(result, 92)}")
        print(f"        message: {trace.message}")
        print()

    missing = set(EXPECTED_TOOLS) - seen_tools
    extra = seen_tools - set(EXPECTED_TOOLS)
    print("  Tool registry coverage:")
    for name in EXPECTED_TOOLS:
        mark = "✓" if name in seen_tools else "—"
        print(f"    {mark} {name}")
    if extra:
        print(f"  Unexpected tools (not in registry): {sorted(extra)}")

    if missing:
        print()
        print(
            f"  NOTE: {len(missing)} tool(s) in the registry were not invoked.\n"
            f"  This is fine for scenarios where the engine only needed a\n"
            f"  subset (e.g. routing.validate may not fire if the decision\n"
            f"  doesn't include a request packet). To exercise every tool,\n"
            f"  use beat47.jsonl + active_defense_escort path."
        )

    return 0


async def _run(scenario_name: str, provider: str) -> int:
    scenario = SCENARIOS_DIR / scenario_name
    if not scenario.exists():
        log.error("scenario file not found: %s", scenario)
        return 1
    print(f"Replaying {scenario_name} via provider={provider}…")
    captured = await _drive(scenario, provider=provider)
    return _print_report(scenario_name, provider, captured)


def main() -> int:
    load_dotenv(ROOT / ".env")
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--scenario",
        default="beat47.jsonl",
        help="Scenario JSONL filename under scenarios/ (default: beat47.jsonl)",
    )
    parser.add_argument(
        "--provider",
        default="stub",
        help="LLM provider: stub | anthropic | ollama (default: stub)",
    )
    args = parser.parse_args()

    return asyncio.run(_run(args.scenario, args.provider))


if __name__ == "__main__":
    raise SystemExit(main())
