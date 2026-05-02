from __future__ import annotations

from collections.abc import Iterable
from typing import Protocol

from halo.services.kb.models import KBEntry
from halo.services.schemas.events import Anomaly, Attribution, Decision

__all__ = ["LLMClient"]


class LLMClient(Protocol):
    async def attribute(
        self, anomalies: list[Anomaly], kb_context: Iterable[KBEntry] = ()
    ) -> Attribution: ...

    async def decide(self, attribution: Attribution) -> Decision: ...
