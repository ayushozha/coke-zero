from __future__ import annotations

import asyncio
from pathlib import Path

from halo.services.attrib import AttribService
from halo.services.bus import InProcessBus
from halo.services.decide import DecideService
from halo.services.fusion import FusionService
from halo.services.kb import KB
from halo.services.llm.stub import StubLLMClient
from halo.services.schemas.events import Anomaly, Attribution, Decision, Signal

KB_DIR = Path(__file__).resolve().parent.parent / "kb" / "entries"


async def test_signals_flow_to_decisions(tmp_path) -> None:
    bus = InProcessBus()
    kb = KB.load_from_yaml(KB_DIR, tmp_path / "kb.sqlite")
    llm = StubLLMClient(kb)

    fusion = FusionService(bus)
    attrib = AttribService(bus, llm, kb)
    decide = DecideService(bus, llm)

    collected: dict[str, list] = {"anomaly": [], "attribution": [], "decision": []}
    done = asyncio.Event()

    async def sniff(pattern: str, key: str) -> None:
        async for topic, event in bus.subscribe(pattern):
            collected[key].append((topic, event))
            if all(collected.values()):
                done.set()

    async def publisher() -> None:
        await asyncio.sleep(0.05)
        await bus.publish(
            "signals.rf_ew",
            Signal(
                domain="rf_ew",
                source="t",
                payload={"band": "GNSS"},
                confidence=0.85,
            ),
        )

    tasks = [
        asyncio.create_task(fusion.run()),
        asyncio.create_task(attrib.run()),
        asyncio.create_task(decide.run()),
        asyncio.create_task(sniff("anomalies.*", "anomaly")),
        asyncio.create_task(sniff("attributions.*", "attribution")),
        asyncio.create_task(sniff("decisions.*", "decision")),
        asyncio.create_task(publisher()),
    ]

    try:
        await asyncio.wait_for(done.wait(), timeout=5.0)
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        bus.close()

    assert collected["anomaly"], "no Anomaly events"
    assert collected["attribution"], "no Attribution events"
    assert collected["decision"], "no Decision events"

    _, anomaly = collected["anomaly"][0]
    _, attribution = collected["attribution"][0]
    _, decision = collected["decision"][0]
    assert isinstance(anomaly, Anomaly)
    assert isinstance(attribution, Attribution)
    assert isinstance(decision, Decision)
    assert attribution.anomaly_ids == [anomaly.id]
    assert decision.attribution_id == attribution.id


async def test_low_confidence_signals_dropped_by_fusion(tmp_path) -> None:
    bus = InProcessBus()
    kb = KB.load_from_yaml(KB_DIR, tmp_path / "kb.sqlite")
    llm = StubLLMClient(kb)
    fusion = FusionService(bus)

    received: list = []

    async def sniff() -> None:
        async for topic, event in bus.subscribe("anomalies.*"):
            received.append((topic, event))

    sniff_task = asyncio.create_task(sniff())
    fusion_task = asyncio.create_task(fusion.run())
    await asyncio.sleep(0.05)

    await bus.publish(
        "signals.rf_ew",
        Signal(domain="rf_ew", source="t", payload={}, confidence=0.3),
    )
    await asyncio.sleep(0.1)

    fusion_task.cancel()
    sniff_task.cancel()
    await asyncio.gather(fusion_task, sniff_task, return_exceptions=True)
    bus.close()

    assert received == []
