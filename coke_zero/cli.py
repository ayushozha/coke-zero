from __future__ import annotations

import argparse
import asyncio
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

from coke_zero._engine import build_engine, start_engine_tasks
from coke_zero.services.attrib import AttribService
from coke_zero.services.bus import InProcessBus
from coke_zero.services.decide import DecideService
from coke_zero.services.fusion import FusionService
from coke_zero.services.kb import KB
from coke_zero.services.llm import LLMClient
from coke_zero.services.mission_watch import MissionWatchService
from coke_zero.services.orbit import OrbitService
from coke_zero.services.scenario_replay import ScenarioReplayService
from coke_zero.services.ui_events import UIEventService

DEFAULT_KB_PATH = Path("data/kb_seed_entries.json")
DEFAULT_WATCH_SCENARIO = "scenarios/army_multidomain_attack_chain.jsonl"
DEFAULT_BEATS = (
    "scenarios/beat1.jsonl",
    "scenarios/beat2.jsonl",
    "scenarios/beat4.jsonl",
    "scenarios/beat47.jsonl",
)


LLM_PROVIDERS = ("stub", "anthropic", "ollama")


def _build_llm(*, provider: str, kb: KB) -> LLMClient:
    if provider == "anthropic":
        from coke_zero.services.llm.anthropic_client import (
            DEFAULT_MODEL,
            AnthropicLLMClient,
        )

        model = os.environ.get("COKE_ZERO_ANTHROPIC_MODEL") or DEFAULT_MODEL
        return AnthropicLLMClient(kb, model=model)
    if provider == "ollama":
        from coke_zero.services.llm.ollama_client import OllamaLLMClient

        return OllamaLLMClient(kb)
    from coke_zero.services.llm.stub import StubLLMClient

    return StubLLMClient(kb)


def _resolve_provider(*, llm_flag: str | None, live_flag: bool) -> str:
    """Pick provider from --llm > COKE_ZERO_LLM env > --live/COKE_ZERO_LIVE > stub."""
    if llm_flag:
        return llm_flag
    env_llm = os.environ.get("COKE_ZERO_LLM")
    if env_llm:
        return env_llm.lower()
    if live_flag or os.environ.get("COKE_ZERO_LIVE"):
        return "anthropic"
    return "stub"


def _live_from_env() -> bool:
    return bool(os.environ.get("COKE_ZERO_LIVE"))


async def main(
    *,
    provider: str = "stub",
    log_level: str = "INFO",
    scenarios: list[str] | None = None,
    scenario_speed: float = 20.0,
    scenario_max_delay_s: float | None = 0.5,
    drain_s: float = 4.0,
    attrib_window_s: float = 2.0,
    kb_path: str | Path = DEFAULT_KB_PATH,
    reset_memory: bool = False,
) -> None:
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    log = logging.getLogger("coke_zero.cli")
    log.info("coke-zero engine starting (llm=%s scenarios=%s)", provider, scenarios)

    engine = build_engine(
        provider=provider,
        kb_path=kb_path,
        attrib_window_s=attrib_window_s,
    )
    if reset_memory:
        engine.mission_memory_store.reset()
        log.info("mission memory reset at %s", engine.mission_memory_store.path)
    tasks = start_engine_tasks(engine)

    replay_task: asyncio.Task | None = None
    done_event: asyncio.Event | None = None
    if scenarios:
        done_event = asyncio.Event()
        replay = ScenarioReplayService(
            engine.bus,
            scenarios,
            speed=scenario_speed,
            max_delay_s=scenario_max_delay_s,
            stop_when_done=done_event,
        )
        replay_task = asyncio.create_task(replay.run(), name="scenario_replay")
        tasks.append(replay_task)

    try:
        if done_event is not None:
            await done_event.wait()
            log.info(
                "scenario replay complete; draining pipeline for %.1fs", drain_s
            )
            await asyncio.sleep(drain_s)
        else:
            log.info("coke-zero engine running. Press Ctrl-C to stop.")
            await asyncio.gather(*tasks)
    except (asyncio.CancelledError, KeyboardInterrupt):
        pass
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        engine.bus.close()


async def watch_main(
    *,
    provider: str = "stub",
    log_level: str = "INFO",
    scenarios: list[str],
    scenario_speed: float = 200.0,
    scenario_max_delay_s: float | None = 0.05,
    drain_s: float = 4.0,
    attrib_window_s: float = 2.0,
    kb_path: str | Path = DEFAULT_KB_PATH,
    watch_interval_s: float = 60.0,
    watch_cycles: int | None = None,
    reset_memory: bool = False,
) -> None:
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    log = logging.getLogger("coke_zero.watch")
    log.info(
        "mission watch starting (llm=%s scenarios=%s interval=%.1fs cycles=%s)",
        provider,
        scenarios,
        watch_interval_s,
        watch_cycles or "forever",
    )

    engine = build_engine(
        provider=provider,
        kb_path=kb_path,
        attrib_window_s=attrib_window_s,
    )
    if reset_memory:
        engine.mission_memory_store.reset()
        log.info("mission memory reset at %s", engine.mission_memory_store.path)
    tasks = start_engine_tasks(engine)
    watch = MissionWatchService(
        engine.bus,
        scenarios,
        interval_s=watch_interval_s,
        speed=scenario_speed,
        max_delay_s=scenario_max_delay_s,
        cycles=watch_cycles,
        tracer=engine.tracer,
    )
    watch_task = asyncio.create_task(watch.run(), name="mission_watch")
    tasks.append(watch_task)

    try:
        if watch_cycles is not None:
            await watch_task
            log.info("mission watch complete; draining pipeline for %.1fs", drain_s)
            await asyncio.sleep(drain_s)
        else:
            log.info("mission watch running. Press Ctrl-C to stop.")
            await asyncio.gather(*tasks)
    except (asyncio.CancelledError, KeyboardInterrupt):
        pass
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        engine.bus.close()


def cli() -> None:
    # Load .env if present so ANTHROPIC_API_KEY / COKE_ZERO_LIVE / COKE_ZERO_ANTHROPIC_MODEL
    # are available before we parse args or build clients. .env values do not
    # override variables that are already set in the environment.
    load_dotenv()

    parser = argparse.ArgumentParser(
        prog="coke_zero", description="coke-zero engine orchestrator"
    )
    parser.add_argument(
        "--llm",
        choices=LLM_PROVIDERS,
        default=None,
        help=(
            "LLM provider: 'stub' (default, no network), 'anthropic' (requires "
            "ANTHROPIC_API_KEY), or 'ollama' (requires COKE_ZERO_OLLAMA_URL). "
            "Falls back to COKE_ZERO_LLM env var, then to --live/COKE_ZERO_LIVE, "
            "then to stub."
        ),
    )
    parser.add_argument(
        "--live",
        action="store_true",
        default=_live_from_env(),
        help="Deprecated alias for --llm anthropic.",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    parser.add_argument(
        "--scenario",
        action="append",
        default=[],
        help=(
            "Replay a scenario JSONL file. Repeat the flag to play several in "
            "sequence. Use --beats to play the canonical four-beat demo."
        ),
    )
    parser.add_argument(
        "--beats",
        action="store_true",
        default=False,
        help="Replay all four canonical beats in order.",
    )
    parser.add_argument("--scenario-speed", type=float, default=20.0)
    parser.add_argument("--scenario-max-delay-s", type=float, default=0.5)
    parser.add_argument("--drain-s", type=float, default=4.0)
    parser.add_argument(
        "--watch",
        action="store_true",
        default=False,
        help=(
            "Run the autonomous mission watch worker. Uses --scenario inputs "
            "or the primary always-on demo scenario when omitted."
        ),
    )
    parser.add_argument(
        "--watch-interval-s",
        type=float,
        default=float(os.environ.get("COKE_ZERO_WATCH_INTERVAL_S", "60")),
        help="Seconds between autonomous watch cycles.",
    )
    parser.add_argument(
        "--watch-cycles",
        type=int,
        default=None,
        help="Number of watch cycles to run before exiting. Omit to run forever.",
    )
    parser.add_argument(
        "--attrib-window-s",
        type=float,
        default=2.0,
        help="Sliding window over anomalies before attribution fires.",
    )
    parser.add_argument(
        "--reset-memory",
        action="store_true",
        default=False,
        help="Reset durable mission memory before starting this run.",
    )
    args = parser.parse_args()

    provider = _resolve_provider(llm_flag=args.llm, live_flag=args.live)

    scenarios = list(args.scenario)
    if args.beats:
        scenarios = list(DEFAULT_BEATS) + scenarios

    try:
        if args.watch:
            asyncio.run(
                watch_main(
                    provider=provider,
                    log_level=args.log_level,
                    scenarios=scenarios or [DEFAULT_WATCH_SCENARIO],
                    scenario_speed=args.scenario_speed,
                    scenario_max_delay_s=args.scenario_max_delay_s,
                    drain_s=args.drain_s,
                    attrib_window_s=args.attrib_window_s,
                    watch_interval_s=args.watch_interval_s,
                    watch_cycles=args.watch_cycles,
                    reset_memory=args.reset_memory,
                )
            )
        else:
            asyncio.run(
                main(
                    provider=provider,
                    log_level=args.log_level,
                    scenarios=scenarios or None,
                    scenario_speed=args.scenario_speed,
                    scenario_max_delay_s=args.scenario_max_delay_s,
                    drain_s=args.drain_s,
                    attrib_window_s=args.attrib_window_s,
                    reset_memory=args.reset_memory,
                )
            )
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    cli()
