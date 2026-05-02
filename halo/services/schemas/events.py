from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

Domain = Literal[
    "rf_ew",
    "cyber",
    "osint",
    "humint",
    "sda",
    "pnt",
    "satcom",
    "drone",
]

Severity = Literal["low", "med", "high"]

Action = Literal[
    "passive_defense",
    "active_defense_escort",
    "active_defense_counterattack",
    "orbital_strike_request",
    "terrestrial_strike_request",
    "space_link_interdiction_request",
    "sda_tasking",
    "threat_warning",
]

Authority = Literal["local", "request"]


def _new_id() -> str:
    return uuid4().hex


def _now() -> datetime:
    return datetime.now(UTC)


class _Event(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str = Field(default_factory=_new_id)
    ts: datetime = Field(default_factory=_now)


class Signal(_Event):
    domain: Domain
    source: str
    payload: dict
    confidence: float = Field(ge=0.0, le=1.0)


class Anomaly(_Event):
    signal_ids: list[str]
    pattern: str
    severity: Severity
    summary: str


class Attribution(_Event):
    anomaly_ids: list[str]
    actor: str
    confidence: float = Field(ge=0.0, le=1.0)
    doctrine_match: str | None = None
    evidence: list[str] = Field(default_factory=list)
    predicted_next: str | None = None
    kb_citations: list[str] = Field(default_factory=list)


class Decision(_Event):
    attribution_id: str
    action: Action
    target: str
    rationale: str
    authority: Authority
    request_packet: dict | None = None
