"""Snapshot test for the recommended judge-demo scenario.

`docs/demo_scenarios.md` names ``scenarios/army_multidomain_attack_chain.jsonl``
as the main story for the pitch — RF, PNT, drone, cyber, SATCOM, and orbital
events fused into one campaign assessment that ends in a request-authority
recommendation. This test pins what the engine emits for that scenario so a
silent change to fusion / stub templates / decision logic / UIEvent builder
fails CI immediately.

When this test fails, decide whether the change is intentional. If it is,
update the expected values below by re-running:

    uv run python scripts/verify.py scenarios/army_multidomain_attack_chain.jsonl

and re-running the diagnostic that captured these expectations:

    uv run python tests/test_demo_snapshot.py  # prints captured values

then paste the new values into this file. Treat that as a deliberate edit —
update the pitch script if it changes too.

This is the stub-LLM snapshot. Live Claude is non-deterministic and is
spot-checked separately via `verify.py --live`.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from halo.services.attrib import AttribService
from halo.services.bus import InProcessBus
from halo.services.decide import DecideService
from halo.services.fusion import FusionService
from halo.services.kb import KB
from halo.services.llm.stub import StubLLMClient
from halo.services.orbit import OrbitService
from halo.services.scenario_replay import ScenarioReplayService
from halo.services.schemas.events import Anomaly, Attribution, Decision, UIEvent
from halo.services.ui_events import UIEventService

ROOT = Path(__file__).resolve().parent.parent
SCENARIO = ROOT / "scenarios" / "army_multidomain_attack_chain.jsonl"
KB_FILE = ROOT / "data" / "kb_seed_entries.json"

EXPECTED_ANOMALY_KINDS_IN_ORDER = [
    "orbital_rpo_risk",
    "rf_anomaly",
    "gnss_spoof",
    "drone_relay_handoff",
    "cyber_probe_burst",
    "satcom_degradation",
    "orbital_rpo_risk",
    "osint_multi_domain_attack",
]

EXPECTED_ANOMALY_SOURCE_SIGNALS = [
    "army-chain-001",
    "army-chain-002",
    "army-chain-003",
    "army-chain-004",
    "army-chain-005",
    "army-chain-006",
    "army-chain-007",
    "army-chain-008",
]

EXPECTED_ANOMALY_SEVERITIES = [0.81, 0.86, 0.90, 0.88, 0.83, 0.84, 0.82, 0.91]

EXPECTED_ATTRIBUTION_ACTOR = "China"
EXPECTED_ATTRIBUTION_CONFIDENCE = 0.74
EXPECTED_ATTRIBUTION_CITATIONS = {
    "kb-rpo-ambiguity-001",
    "kb-gps-jamming-001",
    "kb-satcom-jamming-001",
    "kb-attribution-uncertainty-001",
}

EXPECTED_DECISION_ACTION = "active_defense_escort"
EXPECTED_DECISION_AUTHORITY = "request"
EXPECTED_DECISION_TARGET = "threatened_geo_asset"

EXPECTED_UI_EVENT_TYPE = "recommendation_created"
EXPECTED_UI_EVENT_SEVERITY = "high"
EXPECTED_UI_EVENT_TITLE = "Active defense escort recommended — China"

# Maneuver enrichment from DecideService + OrbitService. The first
# orbital_rpo_risk anomaly in this scenario fires from army-chain-001 — a
# screening_overlay signal whose observables carry range_km=18.5 and
# time_of_closest_approach=2026-06-18T15:55:30Z. The signal arrives at
# 15:40:00Z, the engine adds a 60 s authorization buffer (t_burn=15:41:00Z),
# lead = 870 s. Real Clohessy-Wiltshire physics: with a 5 m/s prograde Δv
# (capped) over an 870 s lead, you gain ~4.2 km of LVLH drift, which bumps
# the miss from 18.5 → 19.0 km. Honest physics, modest gain — bigger numbers
# come from longer-lead scenarios.
EXPECTED_MANEUVER_FRIENDLY = "CANOPY-LEO-07"
EXPECTED_MANEUVER_INSPECTOR = "UNKNOWN-RSO-441"
EXPECTED_PRE_MISS_KM = 18.5
EXPECTED_POST_MISS_KM = 19.0
EXPECTED_DV_M_S = 5.0
EXPECTED_LEAD_SECONDS = 870.0
EXPECTED_BURN_UTC = "2026-06-18T15:41:00Z"
EXPECTED_MANEUVER_CLAUSE = (
    "Recommended maneuver: CANOPY-LEO-07 5.0 m/s burn, "
    "miss 18.5 → 19.0 km (+0.5 km separation)."
)


async def _run_pipeline() -> dict[str, list]:
    bus = InProcessBus()
    kb = KB.load_from_json(KB_FILE)
    llm = StubLLMClient(kb)
    orbit = OrbitService()
    services = [
        FusionService(bus),
        AttribService(bus, llm, kb, window_s=0.2),
        DecideService(bus, llm, orbit=orbit),
        UIEventService(bus),
    ]
    collected: dict[str, list] = {
        "anomaly": [],
        "attribution": [],
        "decision": [],
        "ui_event": [],
    }

    async def sniff(pattern: str, key: str) -> None:
        async for _, event in bus.subscribe(pattern):
            collected[key].append(event)

    done = asyncio.Event()
    replay = ScenarioReplayService(
        bus, SCENARIO, speed=1000.0, max_delay_s=0.0, stop_when_done=done
    )
    tasks = [
        *(asyncio.create_task(s.run()) for s in services),
        asyncio.create_task(sniff("anomalies.*", "anomaly")),
        asyncio.create_task(sniff("attributions.*", "attribution")),
        asyncio.create_task(sniff("decisions.*", "decision")),
        asyncio.create_task(sniff("ui_events.*", "ui_event")),
        asyncio.create_task(replay.run()),
    ]
    try:
        await asyncio.wait_for(done.wait(), timeout=4.0)
        await asyncio.sleep(0.6)
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        bus.close()

    return collected


@pytest.fixture(scope="module")
def pipeline_output() -> dict[str, list]:
    return asyncio.run(_run_pipeline())


def test_event_counts(pipeline_output) -> None:
    assert len(pipeline_output["anomaly"]) == 8
    assert len(pipeline_output["attribution"]) == 1
    assert len(pipeline_output["decision"]) == 1
    assert len(pipeline_output["ui_event"]) == 1


def test_anomaly_kinds_and_source_signals(pipeline_output) -> None:
    anomalies = pipeline_output["anomaly"]
    assert all(isinstance(a, Anomaly) for a in anomalies)
    assert [a.kind for a in anomalies] == EXPECTED_ANOMALY_KINDS_IN_ORDER
    assert [a.source_signal for a in anomalies] == EXPECTED_ANOMALY_SOURCE_SIGNALS


def test_anomaly_severities(pipeline_output) -> None:
    severities = [round(a.severity, 2) for a in pipeline_output["anomaly"]]
    assert severities == EXPECTED_ANOMALY_SEVERITIES


def test_attribution(pipeline_output) -> None:
    attribution = pipeline_output["attribution"][0]
    assert isinstance(attribution, Attribution)
    assert attribution.actor == EXPECTED_ATTRIBUTION_ACTOR
    assert attribution.confidence == pytest.approx(EXPECTED_ATTRIBUTION_CONFIDENCE)
    assert set(attribution.kb_citations) == EXPECTED_ATTRIBUTION_CITATIONS
    assert attribution.source_signal_ids == EXPECTED_ANOMALY_SOURCE_SIGNALS


def test_decision(pipeline_output) -> None:
    decision = pipeline_output["decision"][0]
    assert isinstance(decision, Decision)
    assert decision.action == EXPECTED_DECISION_ACTION
    assert decision.authority == EXPECTED_DECISION_AUTHORITY
    assert decision.target == EXPECTED_DECISION_TARGET
    # request-authority decisions must always carry a populated CJFSCC envelope
    assert decision.request_packet is not None
    assert decision.request_packet["to"] == "CJFSCC"
    assert decision.source_signal_ids == EXPECTED_ANOMALY_SOURCE_SIGNALS


def test_decision_request_packet_carries_maneuver_math(pipeline_output) -> None:
    """The orbital enrichment in DecideService should populate the pre/post
    miss distance and recommended_burn block for the operator's APPROVE card.
    Math comes from OrbitService's Clohessy-Wiltshire impulsive model."""
    packet = pipeline_output["decision"][0].request_packet
    assert packet["pre_miss_km"] == pytest.approx(EXPECTED_PRE_MISS_KM)
    assert packet["post_miss_km"] == pytest.approx(EXPECTED_POST_MISS_KM)

    burn = packet["recommended_burn"]
    assert burn["sat"] == EXPECTED_MANEUVER_FRIENDLY
    assert burn["against"] == EXPECTED_MANEUVER_INSPECTOR
    assert burn["dv_m_s"] == pytest.approx(EXPECTED_DV_M_S)
    # t_burn_utc = signal.ts + 60 s authorization buffer.
    assert burn["t_burn_utc"] == EXPECTED_BURN_UTC
    # lead_seconds = TCA - t_burn, used by Clohessy-Wiltshire.
    assert burn["lead_seconds"] == pytest.approx(EXPECTED_LEAD_SECONDS)


def test_ui_event(pipeline_output) -> None:
    ui_event = pipeline_output["ui_event"][0]
    assert isinstance(ui_event, UIEvent)
    assert ui_event.type == EXPECTED_UI_EVENT_TYPE
    assert ui_event.severity == EXPECTED_UI_EVENT_SEVERITY
    assert ui_event.title == EXPECTED_UI_EVENT_TITLE
    assert ui_event.confidence == pytest.approx(EXPECTED_ATTRIBUTION_CONFIDENCE)
    # request-authority UIEvents must surface an APPROVE button (recommendation)
    assert ui_event.recommendation is not None
    assert ui_event.recommendation.approveLabel == "APPROVE"
    # The whole signal-id chain must propagate so the UI can highlight which
    # raw signals drove the recommendation.
    assert ui_event.source_signal_ids == EXPECTED_ANOMALY_SOURCE_SIGNALS
    # The maneuver clause is the visible upgrade from "do something" words
    # to specific numbers on the operator's card.
    assert EXPECTED_MANEUVER_CLAUSE in ui_event.message


if __name__ == "__main__":
    """Print captured values to make snapshot updates easy."""
    out = asyncio.run(_run_pipeline())
    print(f"Anomaly kinds: {[a.kind for a in out['anomaly']]}")
    print(f"Anomaly source_signals: {[a.source_signal for a in out['anomaly']]}")
    print(f"Anomaly severities: {[round(a.severity, 2) for a in out['anomaly']]}")
    a = out["attribution"][0]
    print(f"Attribution: actor={a.actor!r} confidence={a.confidence}")
    print(f"Attribution citations: {sorted(a.kb_citations)}")
    d = out["decision"][0]
    print(f"Decision: action={d.action!r} authority={d.authority!r} target={d.target!r}")
    u = out["ui_event"][0]
    print(f"UIEvent: type={u.type!r} severity={u.severity!r} title={u.title!r}")
