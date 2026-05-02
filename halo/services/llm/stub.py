from __future__ import annotations

import logging
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass

from halo.services.kb import KB
from halo.services.kb.models import KBEntry
from halo.services.schemas.events import (
    Action,
    Anomaly,
    Attribution,
    Authority,
    Decision,
)

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class _StubAttribution:
    actor: str
    confidence: float
    doctrine_match: str | None
    evidence: list[str]
    predicted_next: str | None
    kb_citations: list[str]


@dataclass(frozen=True)
class _StubDecision:
    action: Action
    target: str
    rationale: str
    authority: Authority


_PATTERN_TO_ATTRIBUTION: dict[str, _StubAttribution] = {
    "placeholder_high_confidence": _StubAttribution(
        actor="Unknown",
        confidence=0.50,
        doctrine_match=None,
        evidence=["High-confidence signal cluster; no real fusion logic in foundation pass."],
        predicted_next=None,
        kb_citations=[],
    ),
    "gps_spoof": _StubAttribution(
        actor="Russia / GRU",
        confidence=0.78,
        doctrine_match="ru_pole21_rf",
        evidence=[
            "GPS position/inertial mismatch consistent with Pole-21 spoof signature.",
            "Geographic and band profile match published Russian deployments.",
        ],
        predicted_next="Expect concurrent or near-term co-orbital action against linked space assets.",
        kb_citations=["ru_pole21_rf", "ru_doctrine_rf_coorbital_pairing"],
    ),
    "rpo_close_approach": _StubAttribution(
        actor="China / PLA Aerospace Force",
        confidence=0.82,
        doctrine_match="cn_beidou_2022_rpo_precedent",
        evidence=[
            "Close-approach geometry at GEO with low relative velocity.",
            "Profile matches the SJ-21 2022 BeiDou grapple-and-relocate precedent.",
        ],
        predicted_next="Capability supports relocation, interrogation, or tow of the target asset.",
        kb_citations=["cn_sj21_grapple", "cn_beidou_2022_rpo_precedent"],
    ),
    "cyber_probe_burst": _StubAttribution(
        actor="Russia / GRU Unit 26165",
        confidence=0.74,
        doctrine_match="ru_gru26165_cyber",
        evidence=[
            "Probe burst against ground-segment infrastructure.",
            "TTPs align with published APT28 / GRU 26165 tradecraft.",
        ],
        predicted_next="Cyber probe phase may precede RF or co-orbital action by minutes to hours.",
        kb_citations=["ru_gru26165_cyber", "ru_doctrine_rf_coorbital_pairing"],
    ),
    "rf_anomaly": _StubAttribution(
        actor="Russia",
        confidence=0.68,
        doctrine_match="ru_krasukha4_jam",
        evidence=[
            "Broadband RF jamming across uplink/downlink.",
            "Pattern consistent with Krasukha-4-class mobile EW.",
        ],
        predicted_next="Expect SAT link degradation through the jam envelope window.",
        kb_citations=["ru_krasukha4_jam", "ru_bylina_ew"],
    ),
}


_ACTOR_TO_DECISION: dict[str, _StubDecision] = {
    "Russia / GRU": _StubDecision(
        action="passive_defense",
        target="affected_drone_swarm",
        rationale="Switching PNT to Galileo-primary; hardening operator link. Local authority.",
        authority="local",
    ),
    "Russia / GRU Unit 26165": _StubDecision(
        action="threat_warning",
        target="brigade_s2",
        rationale="Cyber probe cluster matches pre-RF/co-orbital tradecraft. Issuing watch alert.",
        authority="local",
    ),
    "Russia": _StubDecision(
        action="passive_defense",
        target="satcom_link",
        rationale="Mask vulnerable downlinks during the jam envelope. Local authority.",
        authority="local",
    ),
    "China / PLA Aerospace Force": _StubDecision(
        action="active_defense_escort",
        target="affected_geo_asset",
        rationale="Inspector approach matches SJ-21 grapple precedent. Recommending orbital reposition request to CJFSCC.",
        authority="request",
    ),
    "Unknown": _StubDecision(
        action="threat_warning",
        target="brigade_commander",
        rationale="Foundation-pass placeholder: high-confidence signal cluster pending real fusion logic.",
        authority="local",
    ),
}


_DEFAULT_DECISION = _StubDecision(
    action="threat_warning",
    target="brigade_commander",
    rationale="Stubbed decision for unmapped attribution.",
    authority="local",
)


class StubLLMClient:
    """Deterministic, hand-authored LLMClient implementation.

    Default behavior for the foundation pass; matches the doc's "stub these by
    hour 6" guidance so the engine is rehearsable and offline. The pattern and
    actor maps cite real KB entry ids when available, so downstream consumers
    can resolve citations against the loaded KB.
    """

    def __init__(self, kb: KB) -> None:
        self._kb = kb

    async def attribute(
        self, anomalies: list[Anomaly], kb_context: Iterable[KBEntry] = ()
    ) -> Attribution:
        if not anomalies:
            raise ValueError("attribute() requires at least one anomaly")
        dominant_pattern = Counter(a.pattern for a in anomalies).most_common(1)[0][0]
        stub = _PATTERN_TO_ATTRIBUTION.get(
            dominant_pattern, _PATTERN_TO_ATTRIBUTION["placeholder_high_confidence"]
        )
        # Filter citations to ones actually loaded in the KB so attribution
        # never references a missing entry.
        citations = [cid for cid in stub.kb_citations if self._kb.get(cid)]
        return Attribution(
            anomaly_ids=[a.id for a in anomalies],
            actor=stub.actor,
            confidence=stub.confidence,
            doctrine_match=stub.doctrine_match if stub.doctrine_match in citations else None,
            evidence=list(stub.evidence),
            predicted_next=stub.predicted_next,
            kb_citations=citations,
        )

    async def decide(self, attribution: Attribution) -> Decision:
        stub = _ACTOR_TO_DECISION.get(attribution.actor, _DEFAULT_DECISION)
        request_packet = (
            {
                "to": "CJFSCC",
                "supporting_supported": "supported_by_USSF",
                "justification": attribution.evidence,
                "actor": attribution.actor,
                "confidence": attribution.confidence,
            }
            if stub.authority == "request"
            else None
        )
        return Decision(
            attribution_id=attribution.id,
            action=stub.action,
            target=stub.target,
            rationale=stub.rationale,
            authority=stub.authority,
            request_packet=request_packet,
        )
