"""A/B verification of stress mode against a single scenario.

Builds the engine in-process (no WebSocket, no UI), replays beat47 once
in a clean state and once with two domains blocked, and prints a side-by-
side comparison so you can see exactly what stress mode changes:

* Anomaly count (signals from blocked domains drop at fusion).
* Attribution confidence (haircut applied when critical input domains
  are blocked).
* [stress] reasoning traces (signal drops + confidence lowering events).

Usage:

    uv run python scripts/demo_stress.py
    uv run python scripts/demo_stress.py --scenario beat47.jsonl --block pnt satcom
    uv run python scripts/demo_stress.py --scenario army_multidomain_attack_chain.jsonl --block pnt
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from canopy._engine import build_engine, start_engine_tasks  # noqa: E402
from canopy.services.scenario_replay import ScenarioReplayService  # noqa: E402
from canopy.services.schemas.events import (  # noqa: E402
    Anomaly,
    Attribution,
    Decision,
    ReasoningTrace,
)

ROOT = Path(__file__).resolve().parent.parent
SCENARIOS_DIR = ROOT / "scenarios"
PER_SCENARIO_TIMEOUT = 60.0
# Drain budget needs to be longer than the attrib window plus typical LLM
# latency (the stub is sub-ms; live providers should bump this).
DRAIN_S = 3.0

log = logging.getLogger(__name__)


async def _drive(scenario: Path, blocked: set[str]) -> dict[str, list]:
    """Run one scenario through a fresh engine; return captured events."""
    captured: dict[str, list] = {
        "anomaly": [],
        "attribution": [],
        "decision": [],
        "trace": [],
    }

    # window_s=0.5 batches the scenario's anomaly cluster into a single
    # attribution call, matching the production demo (default 2.0s) but
    # tightened so the script finishes promptly. Without batching, every
    # anomaly fires its own attribution and the "final" we capture is
    # whichever happened to land last on the bus — misleading for A/B.
    engine = build_engine(
        provider="stub",
        attrib_window_s=0.5,
        blocked_domains_provider=lambda: blocked,
    )
    tasks = start_engine_tasks(engine)

    async def consume(pattern: str, kind: str, expected_type) -> None:
        async for _, event in engine.bus.subscribe(pattern):
            if isinstance(event, expected_type):
                captured[kind].append(event)

    consumers = [
        asyncio.create_task(consume("anomalies.*", "anomaly", Anomaly)),
        asyncio.create_task(consume("attributions.*", "attribution", Attribution)),
        asyncio.create_task(consume("decisions.*", "decision", Decision)),
        asyncio.create_task(consume("traces.*", "trace", ReasoningTrace)),
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

    # Let the pipeline drain — fusion + attrib + decide all need to complete.
    deadline = asyncio.get_event_loop().time() + DRAIN_S
    while asyncio.get_event_loop().time() < deadline:
        if captured["decision"]:
            break
        await asyncio.sleep(0.05)
    await asyncio.sleep(0.2)

    replay_task.cancel()
    for c in consumers:
        c.cancel()
    for t in tasks:
        t.cancel()
    await asyncio.gather(
        replay_task,
        *consumers,
        *tasks,
        return_exceptions=True,
    )
    engine.bus.close()

    return captured


def _print_run(label: str, captured: dict[str, list]) -> None:
    anomalies = captured["anomaly"]
    attribution: Attribution | None = (
        captured["attribution"][-1] if captured["attribution"] else None
    )
    decision: Decision | None = captured["decision"][-1] if captured["decision"] else None
    stress_traces = [
        t for t in captured["trace"] if isinstance(t, ReasoningTrace) and t.stage == "stress"
    ]

    print()
    print("=" * 78)
    print(f"  {label}")
    print("=" * 78)
    print(f"  Anomalies emitted        : {len(anomalies)}")
    print(f"  [stress] trace lines     : {len(stress_traces)}")
    if attribution is not None:
        print(f"  Attribution actor        : {attribution.actor}")
        print(f"  Attribution confidence   : {attribution.confidence:.3f}")
    else:
        print("  Attribution              : (none — pipeline did not produce one)")
    if decision is not None:
        print(f"  Decision action          : {decision.action}")
        print(f"  Decision authority       : {decision.authority}")
    else:
        print("  Decision                 : (none)")

    if stress_traces:
        print()
        print("  Stress trace lines:")
        for trace in stress_traces[:8]:
            print(f"    [{trace.stage}/{trace.level}] {trace.message}")
        if len(stress_traces) > 8:
            print(f"    … and {len(stress_traces) - 8} more")


def _print_diff(clean: dict[str, list], stressed: dict[str, list], blocked: set[str]) -> None:
    print()
    print("=" * 78)
    print(f"  DIFF — blocked domains: {sorted(blocked) or '(none)'}")
    print("=" * 78)
    da = len(clean["anomaly"]) - len(stressed["anomaly"])
    print(
        f"  Anomalies suppressed by fusion : {da} "
        f"(clean={len(clean['anomaly'])} → stressed={len(stressed['anomaly'])})"
    )
    clean_attr = clean["attribution"][-1] if clean["attribution"] else None
    stressed_attr = stressed["attribution"][-1] if stressed["attribution"] else None
    if clean_attr and stressed_attr:
        delta = stressed_attr.confidence - clean_attr.confidence
        print(
            f"  Attribution confidence delta   : "
            f"{clean_attr.confidence:.3f} → {stressed_attr.confidence:.3f} "
            f"(Δ{delta:+.3f})"
        )
    n_stress = sum(
        1 for t in stressed["trace"]
        if isinstance(t, ReasoningTrace) and t.stage == "stress"
    )
    print(f"  Stress trace lines emitted     : {n_stress}")
    print()
    if da == 0 and clean_attr and stressed_attr and clean_attr.confidence == stressed_attr.confidence:
        print(
            "  WARNING: stress mode produced no observable effect. Either the "
            "blocked domains are not present in this scenario, or the "
            "attribution's critical-domain map does not include them."
        )


async def _run(scenario_name: str, block: list[str]) -> int:
    scenario = SCENARIOS_DIR / scenario_name
    if not scenario.exists():
        log.error("scenario file not found: %s", scenario)
        return 1

    print(f"Replaying {scenario_name} via stub LLM in two passes…")
    blocked = set(block)

    clean = await _drive(scenario, blocked=set())
    stressed = await _drive(scenario, blocked=blocked)

    _print_run("CLEAN — no domains blocked", clean)
    _print_run(f"STRESSED — blocked: {sorted(blocked) or '(none)'}", stressed)
    _print_diff(clean, stressed, blocked)
    return 0


def main() -> int:
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", default="beat47.jsonl")
    parser.add_argument(
        "--block",
        nargs="+",
        default=["pnt", "satcom"],
        help="Domains to block in the stressed pass (default: pnt satcom)",
    )
    args = parser.parse_args()

    return asyncio.run(_run(args.scenario, args.block))


if __name__ == "__main__":
    raise SystemExit(main())
