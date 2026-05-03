from __future__ import annotations

from collections.abc import Iterable
from typing import Protocol

from halo.services.kb.models import KBEntry
from halo.services.schemas.events import (
    Anomaly,
    Attribution,
    AttributionChallenge,
    Decision,
)

__all__ = ["LLMClient"]


class LLMClient(Protocol):
    async def attribute(
        self, anomalies: list[Anomaly], kb_context: Iterable[KBEntry] = ()
    ) -> Attribution:
        """Single-pass attribution. Default backwards-compatible entry point.

        Implementations may delegate to :meth:`attribute_primary` for the same
        result. The :class:`~halo.services.attrib.AttribService` orchestrator
        prefers the three-pass primary → redteam → reconcile pipeline; this
        method is preserved for tests and clients that want a single call.
        """
        ...

    async def attribute_primary(
        self, anomalies: list[Anomaly], kb_context: Iterable[KBEntry] = ()
    ) -> Attribution:
        """Primary attribution agent — first pass, before red-team challenge."""
        ...

    async def attribute_redteam(
        self,
        primary: Attribution,
        anomalies: list[Anomaly],
        kb_context: Iterable[KBEntry] = (),
    ) -> AttributionChallenge:
        """Red-team agent — critiques the primary attribution."""
        ...

    async def reconcile(
        self,
        primary: Attribution,
        challenge: AttributionChallenge,
        anomalies: list[Anomaly],
        kb_context: Iterable[KBEntry] = (),
    ) -> Attribution:
        """Reconciler agent — produces the final, calibrated attribution."""
        ...

    async def decide(self, attribution: Attribution) -> Decision: ...
