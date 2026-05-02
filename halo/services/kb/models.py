from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class KBEntry(BaseModel):
    """A single attribution knowledge base entry.

    `signature` is a free-form dict describing the observable pattern (band,
    profile, behavior, deployment, etc.). `domain` is also free-form here
    rather than constrained to the `Signal.domain` Literal — KB entries cover
    orbital behaviors that don't map 1:1 to ingest domains.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    actor: str
    unit: str | None = None
    system: str
    domain: str
    signature: dict = Field(default_factory=dict)
    doctrine: str
    sources: list[str] = Field(default_factory=list)
    notes: str | None = None
