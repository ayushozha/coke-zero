from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from pathlib import Path

from halo.services.attrib import AttribService
from halo.services.bus import InProcessBus
from halo.services.decide import DecideService
from halo.services.fusion import FusionService
from halo.services.kb import KB
from halo.services.llm.stub import StubLLMClient
from halo.services.scenario_replay import ScenarioReplayService
from halo.services.schemas.events import (
    Anomaly,
    Attribution,
    Decision,
    Location,
    Provenance,
    Signal,
    UIEvent,
)
from halo.services.ui_events import UIEventService

ROOT = Path(__file__).resolve().parent.parent
KB_FILE = ROOT / "data" / "kb_seed_entries.json"


def _signal(
    *,
    domain: str = "rf_ew",
    event_type: str = "rf_interference",
    confidence: float = 0.85,
    summary: str = "stub",
    sig_id: str | None = None,
) -> Signal:
    kwargs = dict(
        domain=domain,
        source="t",
        realism="mock_operational",
        confidence=confidence,
        location=Location(label="t"),
        payload={"event_type": event_type, "summary": summary},
        provenance=Provenance(source_id="t"),
    )
    if sig_id is not None:
        kwargs["id"] = sig_id
    return Signal(**kwargs)


async def _drive_pipeline(
    bus: InProcessBus, signals: list[Signal], *, attrib_window_s: float = 0.0
) -> dict[str, list]:
    kb = KB.load_from_json(KB_FILE)
    llm = StubLLMClient(kb)

    fusion = FusionService(bus)
    attrib = AttribService(bus, llm, kb, window_s=attrib_window_s)
    decide = DecideService(bus, llm)
    ui = UIEventService(bus)

    collected: dict[str, list] = {
        "anomaly": [],
        "attribution": [],
        "decision": [],
        "ui_event": [],
    }
    done = asyncio.Event()
    expected_keys = {"anomaly", "attribution", "decision", "ui_event"}

    async def sniff(pattern: str, key: str) -> None:
        async for topic, event in bus.subscribe(pattern):
            collected[key].append((topic, event))
            if all(collected[k] for k in expected_keys):
                done.set()

    async def publisher() -> None:
        await asyncio.sleep(0.05)
        for sig in signals:
            await bus.publish(f"signals.{sig.domain}", sig)

    tasks = [
        asyncio.create_task(fusion.run()),
        asyncio.create_task(attrib.run()),
        asyncio.create_task(decide.run()),
        asyncio.create_task(ui.run()),
        asyncio.create_task(sniff("anomalies.*", "anomaly")),
        asyncio.create_task(sniff("attributions.*", "attribution")),
        asyncio.create_task(sniff("decisions.*", "decision")),
        asyncio.create_task(sniff("ui_events.*", "ui_event")),
        asyncio.create_task(publisher()),
    ]

    try:
        await asyncio.wait_for(done.wait(), timeout=5.0)
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        bus.close()

    return collected


async def test_signals_flow_through_to_ui_events() -> None:
    bus = InProcessBus()
    signals = [
        _signal(
            domain="rf_ew",
            event_type="rf_interference",
            sig_id="canopy-beat2-001",
        ),
    ]
    collected = await _drive_pipeline(bus, signals)

    assert collected["anomaly"], "no Anomaly events"
    assert collected["attribution"], "no Attribution events"
    assert collected["decision"], "no Decision events"
    assert collected["ui_event"], "no UIEvent events"

    _, anomaly = collected["anomaly"][0]
    _, attribution = collected["attribution"][0]
    _, decision = collected["decision"][0]
    _, ui_event = collected["ui_event"][0]

    assert isinstance(anomaly, Anomaly)
    assert isinstance(attribution, Attribution)
    assert isinstance(decision, Decision)
    assert isinstance(ui_event, UIEvent)

    assert anomaly.kind == "rf_anomaly"
    assert attribution.actor == "Russia"
    assert "kb-gps-jamming-001" in attribution.kb_citations
    assert "kb-attribution-uncertainty-001" in attribution.kb_citations
    assert decision.action == "passive_defense"
    assert decision.authority == "local"
    assert ui_event.type == "threat_updated"
    assert ui_event.demoBeat == "2"


async def test_rpo_signal_produces_request_authority_decision() -> None:
    bus = InProcessBus()
    signals = [
        Signal(
            id="canopy-beat47-002",
            ts=datetime(2026, 6, 18, 14, 42, 10, tzinfo=UTC),
            domain="orbit",
            source="rpo-close-approach-overlay",
            realism="synthetic_orbital_overlay",
            confidence=0.78,
            location=Location(label="LEO close-approach"),
            payload={
                "event_type": "rpo_close_approach",
                "summary": "Close approach inside watch box",
                "asset": "UNKNOWN-RSO-441",
                "observables": {"miss_distance_km": 8.6, "target": "CANOPY-LEO-07"},
            },
            provenance=Provenance(source_id="canopy-demo-feed-worker"),
        )
    ]
    collected = await _drive_pipeline(bus, signals)

    _, attribution = collected["attribution"][0]
    _, decision = collected["decision"][0]
    _, ui_event = collected["ui_event"][0]

    assert attribution.actor == "China"
    assert "kb-rpo-ambiguity-001" in attribution.kb_citations
    assert decision.action == "active_defense_escort"
    assert decision.authority == "request"
    assert ui_event.type == "recommendation_created"
    assert ui_event.recommendation is not None
    assert ui_event.demoBeat == "4.7"
