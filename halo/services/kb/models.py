from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

KBConfidence = Literal["low", "medium", "high"]
ClaimType = Literal["expert_assessment", "inference", "primary_source", "open_report"]
Sensitivity = Literal["public", "derived", "internal", "controlled"]
EscalationRisk = Literal["low", "medium", "high", "critical"]
TimeHorizon = Literal["historical", "current", "near_term", "long_term"]


class SourceRef(BaseModel):
    model_config = ConfigDict(extra="allow")

    source_id: str
    locator: str | None = None
    claim_supported: str | None = None


class KBEntry(BaseModel):
    """Attribution knowledge-base entry.

    Matches the shape produced by the data lane in
    ``data/kb_seed_entries.json``: each entry carries a doctrinally grounded
    claim plus the demo-scenario signal ids it should be retrievable from, and
    decision implications that downstream agents can lean on.
    """

    model_config = ConfigDict(extra="allow")

    id: str
    title: str
    actor: str
    domain: list[str] = Field(default_factory=list)
    capability_type: str
    summary: str
    tactical_relevance: str | None = None
    decision_implications: list[str] = Field(default_factory=list)
    source_refs: list[SourceRef] = Field(default_factory=list)
    claim_type: ClaimType | None = None
    confidence: KBConfidence | None = None
    sensitivity: Sensitivity | None = None
    escalation_risk: EscalationRisk | None = None
    time_horizon: TimeHorizon | None = None
    scenario_signal_ids: list[str] = Field(default_factory=list)
    notes: str | None = None
