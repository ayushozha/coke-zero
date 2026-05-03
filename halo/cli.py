from __future__ import annotations

import argparse
import asyncio
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

from halo.services.attrib import AttribService
from halo.services.bus import InProcessBus
from halo.services.decide import DecideService
from halo.services.fusion import FusionService
from halo.services.kb import KB
from halo.services.llm import LLMClient
from halo.services.orbit import OrbitService
from halo.services.scenario_replay import ScenarioReplayService
from halo.services.ui_events import UIEventService

DEFAULT_KB_PATH = Path("data/kb_seed_entries.json")
DEFAULT_BEATS = (
    "scenarios/beat1.jsonl",
    "scenarios/beat2.jsonl",
    "scenarios/beat4.jsonl",
    "scenarios/beat47.jsonl",
)


def _build_llm(*, live: bool, kb: KB) -> LLMClient:
    if live:
        from halo.services.llm.anthropic_client import (
            DEFAULT_MODEL,
            AnthropicLLMClient,
        )

        model = os.environ.get("CANOPY_ANTHROPIC_MODEL") or DEFAULT_MODEL
        return AnthropicLLMClient(kb, model=model)
    from halo.services.llm.stub import StubLLMClient

    return StubLLMClient(kb)


def _live_from_env() -> bool:
    return bool(os.environ.get("CANOPY_LIVE"))


async def main(
    *,
    live: bool = False,
    log_level: str = "INFO",
    scenarios: list[str] | None = None,
    scenario_speed: float = 20.0,
    scenario_max_delay_s: float | None = 0.5,
    drain_s: float = 4.0,
    attrib_window_s: float = 2.0,
    kb_path: str | Path = DEFAULT_KB_PATH,
) -> None:
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    log = logging.getLogger("halo.cli")
    log.info("CANOPY engine starting (live=%s scenarios=%s)", live, scenarios)

    bus = InProcessBus()
    kb = KB.load_from_json(kb_path)
    log.info("KB loaded: %d entries from %s", len(kb), kb_path)
    llm = _build_llm(live=live, kb=kb)

    orbit = OrbitService()
    log.info("Orbit service loaded with %d cached satellites", len(orbit.known_satellites()))

    fusion = FusionService(bus)
    attrib = AttribService(bus, llm, kb, window_s=attrib_window_s)
    decide = DecideService(bus, llm, orbit=orbit)
    ui = UIEventService(bus)

    services = [
        ("fusion", fusion.run()),
        ("attrib", attrib.run()),
        ("decide", decide.run()),
        ("ui_events", ui.run()),
    ]
    tasks = [asyncio.create_task(coro, name=name) for name, coro in services]

    replay_task: asyncio.Task | None = None
    done_event: asyncio.Event | None = None
    if scenarios:
        done_event = asyncio.Event()
        replay = ScenarioReplayService(
            bus,
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
            log.info("CANOPY engine running. Press Ctrl-C to stop.")
            await asyncio.gather(*tasks)
    except (asyncio.CancelledError, KeyboardInterrupt):
        pass
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        bus.close()


def cli() -> None:
    # Load .env if present so ANTHROPIC_API_KEY / CANOPY_LIVE / CANOPY_ANTHROPIC_MODEL
    # are available before we parse args or build clients. .env values do not
    # override variables that are already set in the environment.
    load_dotenv()

    parser = argparse.ArgumentParser(
        prog="halo", description="CANOPY engine orchestrator"
    )
    parser.add_argument(
        "--live",
        action="store_true",
        default=_live_from_env(),
        help=(
            "Use the live Anthropic LLM client (requires ANTHROPIC_API_KEY). "
            "Defaults to True if CANOPY_LIVE is set in the environment."
        ),
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
        "--attrib-window-s",
        type=float,
        default=2.0,
        help="Sliding window over anomalies before attribution fires.",
    )
    args = parser.parse_args()

    scenarios = list(args.scenario)
    if args.beats:
        scenarios = list(DEFAULT_BEATS) + scenarios

    try:
        asyncio.run(
            main(
                live=args.live,
                log_level=args.log_level,
                scenarios=scenarios or None,
                scenario_speed=args.scenario_speed,
                scenario_max_delay_s=args.scenario_max_delay_s,
                drain_s=args.drain_s,
                attrib_window_s=args.attrib_window_s,
            )
        )
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    cli()
