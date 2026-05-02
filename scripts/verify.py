"""End-to-end smoke for the CANOPY engine.

Replays one beat scenario through the full pipeline (fusion → attribution →
decision → UIEvent) using the stub LLM and asserts that the expected event
types flow on the bus. Exits 0 on success, 1 with diagnostics on failure.
"""
from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from halo.services.attrib import AttribService  # noqa: E402
from halo.services.bus import InProcessBus  # noqa: E402
from halo.services.decide import DecideService  # noqa: E402
from halo.services.fusion import FusionService  # noqa: E402
from halo.services.kb import KB  # noqa: E402
from halo.services.llm.stub import StubLLMClient  # noqa: E402
from halo.services.scenario_replay import ScenarioReplayService  # noqa: E402
from halo.services.schemas.events import (  # noqa: E402
    Anomaly,
    Attribution,
    Decision,
    UIEvent,
)
from halo.services.ui_events import UIEventService  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SCENARIOS = [
    ROOT / "scenarios" / "beat1.jsonl",
    ROOT / "scenarios" / "beat2.jsonl",
    ROOT / "scenarios" / "beat4.jsonl",
    ROOT / "scenarios" / "beat47.jsonl",
]
TIMEOUT_S = 10.0
DRAIN_S = 1.0


async def _verify(scenarios: list[Path]) -> int:
    bus = InProcessBus()
    kb = KB.load_from_json(ROOT / "data" / "kb_seed_entries.json")
    llm = StubLLMClient(kb)

    fusion = FusionService(bus)
    # Use a small attribution window so the smoke runs fast.
    attrib = AttribService(bus, llm, kb, window_s=0.2)
    decide = DecideService(bus, llm)
    ui = UIEventService(bus)

    collected: dict[str, list] = {
        "anomaly": [],
        "attribution": [],
        "decision": [],
        "ui_event": [],
    }

    async def sniff(pattern: str, key: str) -> None:
        async for topic, event in bus.subscribe(pattern):
            collected[key].append((topic, event))

    replay_done = asyncio.Event()
    replay = ScenarioReplayService(
        bus,
        scenarios,
        speed=200.0,
        max_delay_s=0.05,
        stop_when_done=replay_done,
    )

    tasks = [
        asyncio.create_task(fusion.run(), name="fusion"),
        asyncio.create_task(attrib.run(), name="attrib"),
        asyncio.create_task(decide.run(), name="decide"),
        asyncio.create_task(ui.run(), name="ui_events"),
        asyncio.create_task(sniff("anomalies.*", "anomaly")),
        asyncio.create_task(sniff("attributions.*", "attribution")),
        asyncio.create_task(sniff("decisions.*", "decision")),
        asyncio.create_task(sniff("ui_events.*", "ui_event")),
        asyncio.create_task(replay.run(), name="replay"),
    ]

    try:
        await asyncio.wait_for(replay_done.wait(), timeout=TIMEOUT_S)
        # Allow the pipeline to drain after the last published signal.
        await asyncio.sleep(DRAIN_S + 0.5)
    except TimeoutError:
        pass
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        bus.close()

    failures: list[str] = []
    if not collected["anomaly"]:
        failures.append("no Anomaly events")
    elif not all(isinstance(e, Anomaly) for _, e in collected["anomaly"]):
        failures.append("non-Anomaly leaked onto anomalies.*")
    if not collected["attribution"]:
        failures.append("no Attribution events")
    elif not all(isinstance(e, Attribution) for _, e in collected["attribution"]):
        failures.append("non-Attribution leaked onto attributions.*")
    if not collected["decision"]:
        failures.append("no Decision events")
    elif not all(isinstance(e, Decision) for _, e in collected["decision"]):
        failures.append("non-Decision leaked onto decisions.*")
    if not collected["ui_event"]:
        failures.append("no UIEvent events")
    elif not all(isinstance(e, UIEvent) for _, e in collected["ui_event"]):
        failures.append("non-UIEvent leaked onto ui_events.*")

    # We expect at least one recommendation_created from the Beat 4.7 RPO path.
    if collected["ui_event"]:
        rec_types = {ui_evt.type for _, ui_evt in collected["ui_event"]}
        if "recommendation_created" not in rec_types:
            failures.append(
                "no UIEvent of type=recommendation_created (Beat 4.7 path missing)"
            )

    if failures:
        print("VERIFY FAILED:", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        print(f"  collected: {_summary(collected)}", file=sys.stderr)
        return 1

    print("VERIFY OK")
    print(f"  scenarios: {[p.name for p in scenarios]}")
    for key in ("anomaly", "attribution", "decision", "ui_event"):
        items = collected[key]
        kinds = []
        for topic, e in items[:6]:
            if hasattr(e, "kind"):
                kinds.append(e.kind)
            elif hasattr(e, "actor"):
                kinds.append(e.actor)
            elif hasattr(e, "action"):
                kinds.append(e.action)
            elif hasattr(e, "type"):
                kinds.append(e.type)
        print(f"  {key}: n={len(items)} sample={kinds}")
    return 0


def _summary(collected: dict) -> str:
    return ", ".join(f"{k}={len(v)}" for k, v in collected.items())


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    scenarios = [Path(arg) for arg in sys.argv[1:]] or DEFAULT_SCENARIOS
    return asyncio.run(_verify(scenarios))


if __name__ == "__main__":
    sys.exit(main())
