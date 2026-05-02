"""End-to-end smoke for the CANOPY engine foundation pass.

Boots the engine in-process with the stub LLM, publishes 3 synthetic Signals,
and asserts that at least one valid Anomaly, Attribution, and Decision flow
through the bus within a short window. Exits 0 on success.
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
from halo.services.schemas.events import Anomaly, Attribution, Decision, Signal  # noqa: E402

TIMEOUT_S = 5.0


async def _verify() -> int:
    bus = InProcessBus()
    kb = KB.load_from_yaml(
        entries_dir=Path("kb/entries"),
        db_path=Path("data/kb.sqlite"),
    )
    llm = StubLLMClient(kb)

    fusion = FusionService(bus)
    attrib = AttribService(bus, llm, kb)
    decide = DecideService(bus, llm)

    collected: dict[str, list[tuple[str, object]]] = {
        "anomaly": [],
        "attribution": [],
        "decision": [],
    }
    done = asyncio.Event()

    async def sniff(topic_pattern: str, key: str) -> None:
        async for topic, event in bus.subscribe(topic_pattern):
            collected[key].append((topic, event))
            if all(collected.values()):
                done.set()

    async def publish_signals() -> None:
        # Tiny delay so subscriptions are wired before the publisher fires.
        await asyncio.sleep(0.1)
        signals = [
            Signal(
                domain="rf_ew",
                source="ground-rf-sensor-1",
                payload={"band": "GNSS", "pattern": "wideband_jam"},
                confidence=0.85,
            ),
            Signal(
                domain="pnt",
                source="drone-7",
                payload={"position_inertial_mismatch_m": 132.0},
                confidence=0.81,
            ),
            Signal(
                domain="cyber",
                source="ground-station-1",
                payload={"probe_count": 47, "tradecraft": "apt28-like"},
                confidence=0.79,
            ),
        ]
        for sig in signals:
            await bus.publish(f"signals.{sig.domain}", sig)

    tasks = [
        asyncio.create_task(fusion.run(), name="fusion"),
        asyncio.create_task(attrib.run(), name="attrib"),
        asyncio.create_task(decide.run(), name="decide"),
        asyncio.create_task(sniff("anomalies.*", "anomaly"), name="sniff-anomalies"),
        asyncio.create_task(sniff("attributions.*", "attribution"), name="sniff-attribs"),
        asyncio.create_task(sniff("decisions.*", "decision"), name="sniff-decisions"),
        asyncio.create_task(publish_signals(), name="publisher"),
    ]
    try:
        await asyncio.wait_for(done.wait(), timeout=TIMEOUT_S)
    except TimeoutError:
        pass
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        bus.close()

    failures: list[str] = []
    if not collected["anomaly"]:
        failures.append("no Anomaly events seen on anomalies.*")
    elif not all(isinstance(e, Anomaly) for _, e in collected["anomaly"]):
        failures.append("non-Anomaly event leaked onto anomalies.*")
    if not collected["attribution"]:
        failures.append("no Attribution events seen on attributions.*")
    elif not all(isinstance(e, Attribution) for _, e in collected["attribution"]):
        failures.append("non-Attribution event leaked onto attributions.*")
    if not collected["decision"]:
        failures.append("no Decision events seen on decisions.*")
    elif not all(isinstance(e, Decision) for _, e in collected["decision"]):
        failures.append("non-Decision event leaked onto decisions.*")

    if failures:
        print("VERIFY FAILED:", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        print(f"  collected: {_summary(collected)}", file=sys.stderr)
        return 1

    print("VERIFY OK")
    print(f"  anomalies: {_summary(collected, 'anomaly')}")
    print(f"  attributions: {_summary(collected, 'attribution')}")
    print(f"  decisions: {_summary(collected, 'decision')}")
    return 0


def _summary(collected: dict, key: str | None = None) -> str:
    if key is None:
        return ", ".join(f"{k}={len(v)}" for k, v in collected.items())
    items = collected[key]
    return f"n={len(items)} topics=[{', '.join(t for t, _ in items[:5])}]"


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    return asyncio.run(_verify())


if __name__ == "__main__":
    sys.exit(main())
