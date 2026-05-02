from __future__ import annotations

import argparse
import asyncio
import logging
from pathlib import Path

from halo.services.attrib import AttribService
from halo.services.bus import InProcessBus
from halo.services.decide import DecideService
from halo.services.fusion import FusionService
from halo.services.kb import KB
from halo.services.llm import LLMClient


def _build_llm(*, live: bool, kb: KB) -> LLMClient:
    if live:
        from halo.services.llm.anthropic_client import AnthropicLLMClient

        return AnthropicLLMClient(kb)
    from halo.services.llm.stub import StubLLMClient

    return StubLLMClient(kb)


async def main(*, live: bool = False, log_level: str = "INFO") -> None:
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    log = logging.getLogger("halo.cli")
    log.info("CANOPY engine starting (live=%s)", live)

    bus = InProcessBus()
    kb = KB.load_from_yaml(
        entries_dir=Path("kb/entries"),
        db_path=Path("data/kb.sqlite"),
    )
    log.info("KB loaded: %d entries", len(kb))

    llm = _build_llm(live=live, kb=kb)

    fusion = FusionService(bus)
    attrib = AttribService(bus, llm, kb)
    decide = DecideService(bus, llm)

    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(fusion.run(), name="fusion")
            tg.create_task(attrib.run(), name="attrib")
            tg.create_task(decide.run(), name="decide")
            log.info("CANOPY engine running. Press Ctrl-C to stop.")
    except KeyboardInterrupt:
        log.info("CANOPY engine shutdown requested.")
    finally:
        bus.close()


def cli() -> None:
    parser = argparse.ArgumentParser(prog="halo", description="CANOPY engine orchestrator")
    parser.add_argument(
        "--live",
        action="store_true",
        default=False,
        help="Use the live Anthropic LLM client (requires ANTHROPIC_API_KEY).",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    args = parser.parse_args()
    try:
        asyncio.run(main(live=args.live, log_level=args.log_level))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    cli()
