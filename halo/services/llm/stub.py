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

UNCERTAINTY_ENTRY = "kb-attribution-uncertainty-001"


# ---- Attribution templates -------------------------------------------------


@dataclass(frozen=True)
class _AttribTemplate:
    actor: str
    confidence: float
    evidence: list[str]
    predicted_next: str | None
    capability_lookups: list[str]


_KIND_TO_ATTRIBUTION: dict[str, _AttribTemplate] = {
    "rf_anomaly": _AttribTemplate(
        actor="Russia",
        confidence=0.74,
        evidence=[
            "RF interference signature is consistent with published Russian EW capabilities.",
            "Open-source attribution does not prove actor intent; assessment is confidence-scored.",
        ],
        predicted_next="Watch for paired co-orbital or cyber action inside the correlation window.",
        capability_lookups=["jamming_spoofing"],
    ),
    "gnss_spoof": _AttribTemplate(
        actor="Russia",
        confidence=0.78,
        evidence=[
            "GNSS bias and time-offset are consistent with documented spoof tradecraft.",
            "PNT confidence collapse is the cue; switch to multi-constellation fallback.",
        ],
        predicted_next="Expect concurrent RF or co-orbital action against linked space assets.",
        capability_lookups=["jamming_spoofing"],
    ),
    "cyber_probe_burst": _AttribTemplate(
        actor="Unknown",
        confidence=0.58,
        evidence=[
            "Probe pattern is consistent with credential-access tradecraft.",
            "Cyber attribution alone is uncertain; pair with RF or co-orbital cues before raising confidence.",
        ],
        predicted_next="Cyber probes may precede an RF or co-orbital phase.",
        capability_lookups=["attribution_uncertainty"],
    ),
    "cyber_response_action": _AttribTemplate(
        actor="Unknown",
        confidence=0.45,
        evidence=[
            "Defensive orchestrator action is informational; not adversary attribution.",
        ],
        predicted_next=None,
        capability_lookups=["attribution_uncertainty"],
    ),
    "satcom_degradation": _AttribTemplate(
        actor="Russia",
        confidence=0.66,
        evidence=[
            "SATCOM link degradation is consistent with documented uplink/downlink interference capabilities.",
            "Compound effect with concurrent RPO close-approach raises severity.",
        ],
        predicted_next="If RPO risk emerges in the same window, escalate to space-effect request.",
        capability_lookups=["satcom_jamming"],
    ),
    "drone_spoofing": _AttribTemplate(
        actor="Unknown",
        confidence=0.55,
        evidence=[
            "UAS identity mismatch is consistent with coordinated probing; actor not yet attributable.",
        ],
        predicted_next=None,
        capability_lookups=["attribution_uncertainty"],
    ),
    "drone_lost_link": _AttribTemplate(
        actor="Unknown",
        confidence=0.50,
        evidence=[
            "Drone lost-link event; could indicate RF interference or platform issue.",
        ],
        predicted_next=None,
        capability_lookups=["attribution_uncertainty"],
    ),
    "drone_degraded": _AttribTemplate(
        actor="Unknown",
        confidence=0.50,
        evidence=[
            "Drone telemetry degradation; correlate with PNT/RF before raising confidence.",
        ],
        predicted_next=None,
        capability_lookups=["attribution_uncertainty"],
    ),
    "humint_report": _AttribTemplate(
        actor="Unknown",
        confidence=0.55,
        evidence=[
            "HUMINT report flagged for context; needs operational corroboration.",
        ],
        predicted_next=None,
        capability_lookups=["attribution_uncertainty"],
    ),
    "orbital_rpo_risk": _AttribTemplate(
        actor="China",
        confidence=0.74,
        evidence=[
            "Close-approach geometry is consistent with documented Chinese RPO precedents (e.g., SJ-21 BeiDou relocation).",
            "Public RPO data does not prove hostile intent; the assessment is confidence-scored, not definitive.",
        ],
        predicted_next="If the friendly asset is mission-critical, draft a higher-authority space-effect request.",
        capability_lookups=["co_orbital_rpo"],
    ),
    "orbital_collection_risk": _AttribTemplate(
        actor="Unknown",
        confidence=0.50,
        evidence=[
            "Collection window opening; commercial or adversary tasking pending corroboration.",
        ],
        predicted_next=None,
        capability_lookups=["commercial_dependency"],
    ),
    "orbital_collection_overlap": _AttribTemplate(
        actor="Multi-actor",
        confidence=0.55,
        evidence=[
            "Concurrent collection windows. Commercial overpass risk is part of the contested battlespace.",
        ],
        predicted_next=None,
        capability_lookups=["commercial_dependency"],
    ),
    "orbital_collection_correlated": _AttribTemplate(
        actor="Russia",
        confidence=0.78,
        evidence=[
            "RF or GNSS anomaly inside the collection window is consistent with coordinated multi-domain activity.",
            "Public reporting does not prove actor intent; the assessment is confidence-scored.",
        ],
        predicted_next="Anticipate escalation along the documented RF + co-orbital pairing pattern.",
        capability_lookups=["jamming_spoofing", "attribution_uncertainty"],
    ),
    "osint_close_approach_assessment": _AttribTemplate(
        actor="China",
        confidence=0.70,
        evidence=[
            "OSINT close-approach assessment correlates SATCOM degradation with synthetic RPO inject.",
        ],
        predicted_next="Recommend a higher-authority space-effect request to preserve mission BLOS.",
        capability_lookups=["co_orbital_rpo"],
    ),
    "osint_convergence": _AttribTemplate(
        actor="Multi-actor",
        confidence=0.62,
        evidence=[
            "OSINT convergence assessment links multiple anomalies inside one operational window.",
        ],
        predicted_next=None,
        capability_lookups=["attribution_uncertainty"],
    ),
    "osint_commander_update": _AttribTemplate(
        actor="Multi-actor",
        confidence=0.60,
        evidence=[
            "Mission cell escalation update; treat as operator-derived assessment, not direct sensor.",
        ],
        predicted_next=None,
        capability_lookups=["attribution_uncertainty"],
    ),
    "osint_campaign_assessment": _AttribTemplate(
        actor="Unknown",
        confidence=0.55,
        evidence=[
            "Campaign-level OSINT assessment; pair with sensor cues before raising confidence.",
        ],
        predicted_next=None,
        capability_lookups=["attribution_uncertainty"],
    ),
    "osint_collection_cue": _AttribTemplate(
        actor="Multi-actor",
        confidence=0.50,
        evidence=[
            "OSINT collection cue; informational context for upcoming overpass risk.",
        ],
        predicted_next=None,
        capability_lookups=["commercial_dependency"],
    ),
}

_DEFAULT_ATTRIBUTION = _AttribTemplate(
    actor="Unknown",
    confidence=0.50,
    evidence=["Insufficient signal for confident attribution."],
    predicted_next=None,
    capability_lookups=["attribution_uncertainty"],
)


# ---- Decision templates ----------------------------------------------------


@dataclass(frozen=True)
class _DecisionTemplate:
    action: Action
    target: str
    rationale: str
    authority: Authority


_DECISIONS: dict[str, _DecisionTemplate] = {
    "rpo_escort": _DecisionTemplate(
        action="active_defense_escort",
        target="threatened_geo_asset",
        rationale=(
            "Inspector approach is consistent with documented RPO precedent. "
            "Recommending orbital reposition request to CJFSCC."
        ),
        authority="request",
    ),
    "satcom_interdict": _DecisionTemplate(
        action="space_link_interdiction_request",
        target="satcom_link",
        rationale=(
            "SATCOM link degradation persists; requesting interdiction support to "
            "preserve brigade BLOS."
        ),
        authority="request",
    ),
    "pnt_passive": _DecisionTemplate(
        action="passive_defense",
        target="affected_pnt_receivers",
        rationale=(
            "PNT confidence collapse; switching to multi-constellation fallback "
            "and hardening operator link. Local authority."
        ),
        authority="local",
    ),
    "rf_passive": _DecisionTemplate(
        action="passive_defense",
        target="affected_rf_segment",
        rationale="RF interference inside guard band; switching to hardened comms profile. Local authority.",
        authority="local",
    ),
    "commercial_passive": _DecisionTemplate(
        action="passive_defense",
        target="aor_assets",
        rationale=(
            "Commercial overpass risk; recommending mask of vulnerable assets "
            "during the collection window."
        ),
        authority="local",
    ),
    "cyber_warning": _DecisionTemplate(
        action="threat_warning",
        target="brigade_s2",
        rationale=(
            "Probe activity is consistent with pre-RF/co-orbital tradecraft. "
            "Issuing watch alert."
        ),
        authority="local",
    ),
    "default_warning": _DecisionTemplate(
        action="threat_warning",
        target="brigade_commander",
        rationale="Insufficient signal for direct action; routing as informational threat warning.",
        authority="local",
    ),
}


def _select_decision(citations: list[str], actor: str) -> _DecisionTemplate:
    cset = set(citations)
    if "kb-rpo-ambiguity-001" in cset:
        return _DECISIONS["rpo_escort"]
    if "kb-satcom-jamming-001" in cset:
        return _DECISIONS["satcom_interdict"]
    if "kb-gps-jamming-001" in cset:
        return _DECISIONS["pnt_passive"]
    if "kb-commercial-space-001" in cset:
        return _DECISIONS["commercial_passive"]
    if cset == {UNCERTAINTY_ENTRY}:
        return _DECISIONS["cyber_warning"] if actor == "Unknown" else _DECISIONS["default_warning"]
    return _DECISIONS["default_warning"]


# ---- Stub LLM client -------------------------------------------------------


class StubLLMClient:
    """Deterministic, hand-authored LLMClient for the foundation/scenario pass.

    Attribution selects a template by the dominant anomaly ``kind`` and pulls
    citations from the KB by ``scenario_signal_id`` first, then by
    ``capability_type``. Decisions are picked from the citation set so the
    decision logic stays grounded in the same KB the attribution cites.
    """

    def __init__(self, kb: KB) -> None:
        self._kb = kb

    async def attribute(
        self, anomalies: list[Anomaly], kb_context: Iterable[KBEntry] = ()
    ) -> Attribution:
        if not anomalies:
            raise ValueError("attribute() requires at least one anomaly")

        dominant_kind, _ = Counter(a.kind for a in anomalies).most_common(1)[0]
        template = _KIND_TO_ATTRIBUTION.get(dominant_kind, _DEFAULT_ATTRIBUTION)

        source_ids = list(
            dict.fromkeys(sid for a in anomalies for sid in a.source_signal_ids)
        )

        citations: list[str] = []
        seen: set[str] = set()
        for sid in source_ids:
            for entry in self._kb.by_scenario_signal_id(sid):
                if entry.id not in seen:
                    citations.append(entry.id)
                    seen.add(entry.id)
        if not citations:
            for cap in template.capability_lookups:
                for entry in self._kb.by_capability(cap):
                    if entry.id not in seen:
                        citations.append(entry.id)
                        seen.add(entry.id)

        # Always-on caveat reference per the kb_seed guidance.
        if UNCERTAINTY_ENTRY in self._kb and UNCERTAINTY_ENTRY not in seen:
            citations.append(UNCERTAINTY_ENTRY)

        return Attribution(
            anomaly_ids=[a.id for a in anomalies],
            actor=template.actor,
            confidence=template.confidence,
            doctrine_match=citations[0] if citations else None,
            evidence=list(template.evidence),
            predicted_next=template.predicted_next,
            kb_citations=citations,
            source_signal_ids=source_ids,
        )

    async def decide(self, attribution: Attribution) -> Decision:
        template = _select_decision(attribution.kb_citations, attribution.actor)
        request_packet = (
            {
                "to": "CJFSCC",
                "supporting_supported": "supported_by_USSF",
                "actor": attribution.actor,
                "confidence": attribution.confidence,
                "justification": attribution.evidence,
                "kb_citations": attribution.kb_citations,
            }
            if template.authority == "request"
            else None
        )
        return Decision(
            attribution_id=attribution.id,
            action=template.action,
            target=template.target,
            rationale=template.rationale,
            authority=template.authority,
            request_packet=request_packet,
            source_signal_ids=list(attribution.source_signal_ids),
        )
