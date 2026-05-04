"""Benchmark harness — replays each labeled scenario through the engine
and produces a scorecard.

Usage:

    uv run python -m bench.run                # runs seeds + variants
    uv run python -m bench.run --seeds-only   # skip variants
    uv run python -m bench.run --provider stub
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any

import yaml

from bench import generate as bench_generate
from bench.scoring import (
    ScenarioResult,
    Scorecard,
    action_match,
    actor_match,
    authority_match,
    confidence_band,
    confidence_band_match,
)
from canopy._engine import (
    Engine,
    build_engine,
    resolve_provider,
    start_engine_tasks,
)
from canopy.services.scenario_replay import ScenarioReplayService
from canopy.services.schemas.events import (
    Anomaly,
    Attribution,
    Decision,
    Signal,
    UIEvent,
)

ROOT = Path(__file__).resolve().parent.parent
SEEDS_YAML = Path(__file__).resolve().parent / "seeds.yaml"
SOURCE_DIR = ROOT / "scenarios"
BENCH_DIR = Path(__file__).resolve().parent
VARIANTS_DIR = BENCH_DIR / "scenarios"
SCORECARD = BENCH_DIR / "scorecard.json"
PER_SCENARIO_TIMEOUT = 15.0
# Maximum time to wait after replay finishes for the engine to produce a
# Decision. Stub takes <1ms; Anthropic does primary+redteam+reconcile+decide
# (4 LLM calls) so allow ~90s. Polled — exits as soon as a Decision lands.
DRAIN_BUDGETS_S: dict[str, float] = {
    "stub": 1.0,
    "anthropic": 90.0,
    "ollama": 120.0,
}
DRAIN_DEFAULT_S = 1.0
DRAIN_POLL_S = 0.1

log = logging.getLogger(__name__)


async def _run_scenario(
    engine: Engine,
    path: Path,
    *,
    timeout_s: float = PER_SCENARIO_TIMEOUT,
    drain_budget_s: float = DRAIN_DEFAULT_S,
) -> dict[str, list]:
    """Replay one scenario and capture engine outputs."""
    captured: dict[str, list] = {
        "signal": [],
        "anomaly": [],
        "attribution": [],
        "decision": [],
        "ui_event": [],
    }

    async def consume(pattern: str, kind: str, expected_type) -> None:
        async for _, event in engine.bus.subscribe(pattern):
            if isinstance(event, expected_type):
                captured[kind].append(event)

    consumers = [
        asyncio.create_task(consume("signals.*", "signal", Signal)),
        asyncio.create_task(consume("anomalies.*", "anomaly", Anomaly)),
        asyncio.create_task(consume("attributions.*", "attribution", Attribution)),
        asyncio.create_task(consume("decisions.*", "decision", Decision)),
        asyncio.create_task(consume("ui_events.*", "ui_event", UIEvent)),
    ]

    replay_done = asyncio.Event()
    replay = ScenarioReplayService(
        engine.bus,
        path,
        speed=10000.0,  # blast through historical timestamps
        max_delay_s=0.0,
        stop_when_done=replay_done,
    )
    replay_task = asyncio.create_task(replay.run())

    try:
        await asyncio.wait_for(replay_done.wait(), timeout=timeout_s)
    except asyncio.TimeoutError:
        log.warning("replay timed out for %s", path.name)

    # Drain: poll until we see a Decision (the last stage of the pipeline)
    # or the budget runs out. Anthropic's three attribution calls + decide
    # take ~10-30s, so the previous fixed 0.5s drain captured nothing for
    # live providers and falsely reported them as wrong.
    drain_t0 = time.perf_counter()
    while time.perf_counter() - drain_t0 < drain_budget_s:
        if captured["decision"]:
            # Give one more poll cycle for the decision to fan out to
            # ui_events before we cut the consumers.
            await asyncio.sleep(DRAIN_POLL_S)
            break
        await asyncio.sleep(DRAIN_POLL_S)

    replay_task.cancel()
    for c in consumers:
        c.cancel()
    for t in (replay_task, *consumers):
        try:
            await t
        except asyncio.CancelledError:
            pass

    return captured


def _label_outputs(
    label: dict[str, Any], captured: dict[str, list], elapsed: float
) -> ScenarioResult:
    attribution: Attribution | None = (
        captured["attribution"][-1] if captured["attribution"] else None
    )
    decision: Decision | None = captured["decision"][-1] if captured["decision"] else None

    pred_actor = attribution.actor if attribution else None
    pred_conf = attribution.confidence if attribution else None
    pred_action = decision.action if decision else None
    pred_authority = decision.authority if decision else None

    actor_correct = (
        actor_match(pred_actor or "", label["expected_actor"])
        if pred_actor is not None
        else label["expected_actor"].lower() == "unknown"
    )
    action_correct = (
        action_match(pred_action or "", label["expected_action"])
        if pred_action is not None
        else label["expected_action"] in ("any", "*")
    )
    authority_correct = (
        authority_match(pred_authority or "", label["expected_authority"])
        if pred_authority is not None
        else label["expected_authority"] in ("any", "*")
    )
    calibrated = (
        confidence_band_match(pred_conf, label.get("confidence_band", "med"))
        if pred_conf is not None
        else label.get("confidence_band", "med") == "low"
    )

    return ScenarioResult(
        file=label.get("file", "?"),
        expected_actor=label["expected_actor"],
        predicted_actor=pred_actor,
        expected_action=label["expected_action"],
        predicted_action=pred_action,
        expected_authority=label["expected_authority"],
        predicted_authority=pred_authority,
        confidence=pred_conf,
        expected_confidence_band=label.get("confidence_band", "med"),
        latency_seconds=elapsed,
        actor_correct=actor_correct,
        action_correct=action_correct,
        authority_correct=authority_correct,
        calibrated=calibrated,
    )


def _seed_labels() -> list[dict[str, Any]]:
    config = yaml.safe_load(SEEDS_YAML.read_text())
    out: list[dict[str, Any]] = []
    for seed in config["seeds"]:
        path = SOURCE_DIR / seed["file"]
        if not path.exists():
            continue
        out.append({**seed, "_path": str(path), "file": seed["file"]})
    return out


def _variant_labels() -> list[dict[str, Any]]:
    labels_path = VARIANTS_DIR / "labels.json"
    if not labels_path.exists():
        return []
    raw = json.loads(labels_path.read_text())
    out: list[dict[str, Any]] = []
    for entry in raw:
        rel = entry["file"]
        path = (BENCH_DIR / rel).resolve()
        if not path.exists():
            continue
        out.append({**entry, "_path": str(path)})
    return out


async def _run(
    *,
    provider: str,
    seeds_only: bool,
    limit: int | None,
    multi_agent: bool = True,
) -> Scorecard:
    log.info(
        "Building engine (llm=%s, multi_agent=%s)", provider, multi_agent
    )
    engine = build_engine(
        provider=provider, attrib_window_s=0.0, multi_agent=multi_agent
    )
    tasks = start_engine_tasks(engine)

    scorecard = Scorecard()

    labels: list[dict[str, Any]] = []
    labels.extend(_seed_labels())
    if not seeds_only:
        labels.extend(_variant_labels())
    if limit is not None:
        labels = labels[:limit]

    drain_budget = DRAIN_BUDGETS_S.get(provider, DRAIN_DEFAULT_S)
    log.info(
        "Scoring %d scenarios (drain budget per scenario: %.0fs)",
        len(labels),
        drain_budget,
    )

    try:
        for i, label in enumerate(labels, start=1):
            path = Path(label["_path"])
            t0 = time.perf_counter()
            captured = await _run_scenario(
                engine, path, drain_budget_s=drain_budget
            )
            elapsed = time.perf_counter() - t0
            result = _label_outputs(label, captured, elapsed)
            scorecard.append(result)
            log.info(
                "  [%d/%d] %-50s  actor=%s%s  action=%s%s  "
                "auth=%s%s  conf=%s",
                i,
                len(labels),
                Path(label["file"]).name,
                result.predicted_actor or "—",
                "✓" if result.actor_correct else "✗",
                result.predicted_action or "—",
                "✓" if result.action_correct else "✗",
                result.predicted_authority or "—",
                "✓" if result.authority_correct else "✗",
                f"{result.confidence:.2f}" if result.confidence is not None else "—",
            )
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        engine.bus.close()

    return scorecard


def _print_report(card: Scorecard) -> None:
    means = card.confidence_means()
    print()
    print("=" * 60)
    print(f"Running {card.total} scenarios…")
    print(
        f"Attribution accuracy: {card.correct('actor_correct')}/{card.total} "
        f"= {card.attr_accuracy() * 100:.0f}%"
    )
    print(
        f"  Mean confidence on correct:   {means['correct_mean']:.2f}"
    )
    print(
        f"  Mean confidence on incorrect: {means['incorrect_mean']:.2f}  "
        f"(well-calibrated when correct > incorrect)"
    )
    print("Decision quality:")
    print(
        f"  Action match: {card.correct('action_correct')}/{card.total} "
        f"= {card.action_accuracy() * 100:.0f}%"
    )
    print(
        f"  Authority routing correct: {card.correct('authority_correct')}/{card.total} "
        f"= {card.authority_accuracy() * 100:.0f}%"
    )
    print(
        f"  Confidence calibration tier: {card.correct('calibrated')}/{card.total} "
        f"= {card.calibration_rate() * 100:.0f}%"
    )
    print(f"Latency p50: {card.latency_p(0.5):.2f}s, p95: {card.latency_p(0.95):.2f}s")
    print("=" * 60)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", default=None, help="stub|anthropic|ollama")
    parser.add_argument("--seeds-only", action="store_true")
    parser.add_argument("--regenerate-variants", action="store_true")
    parser.add_argument("--variants", type=int, default=4)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument(
        "--no-redteam",
        action="store_true",
        help="Disable the red-team / reconcile attribution agents (single-pass).",
    )
    args = parser.parse_args()

    if args.regenerate_variants and not args.seeds_only:
        bench_generate.generate(variants_per_seed=args.variants)
    elif not args.seeds_only and not (VARIANTS_DIR / "labels.json").exists():
        bench_generate.generate(variants_per_seed=args.variants)

    provider = resolve_provider(llm_flag=args.provider)
    card = asyncio.run(
        _run(
            provider=provider,
            seeds_only=args.seeds_only,
            limit=args.limit,
            multi_agent=not args.no_redteam,
        )
    )

    SCORECARD.write_text(json.dumps(card.to_dict(), indent=2))
    _print_report(card)
    print(f"Scorecard written to {SCORECARD.relative_to(ROOT)}")

    # Stub LLM is deterministic — actor accuracy is bounded by the
    # _KIND_TO_ATTRIBUTION mapping. Live providers should clear ≥0.50;
    # for the stub baseline we only fail if action+authority routing
    # collapses, since those are deterministic and stable.
    gate = 0.5 if provider != "stub" else 0.0
    if card.action_accuracy() < 0.85:
        log.error(
            "Action accuracy %.0f%% below 85%% routing gate",
            card.action_accuracy() * 100,
        )
        return 1
    if card.attr_accuracy() < gate:
        log.error(
            "Attribution accuracy %.0f%% below %.0f%% gate",
            card.attr_accuracy() * 100,
            gate * 100,
        )
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
