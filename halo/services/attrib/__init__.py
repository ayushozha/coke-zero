from __future__ import annotations

import logging

from halo.services.bus import Bus
from halo.services.kb import KB
from halo.services.llm import LLMClient
from halo.services.schemas.events import Anomaly

log = logging.getLogger(__name__)

__all__ = ["AttribService"]


def _country_topic(actor: str) -> str:
    head = actor.split("/", 1)[0].strip().lower()
    return head.replace(" ", "_") or "unknown"


class AttribService:
    """Attribution-stage skeleton.

    Subscribes to `anomalies.*`, calls the LLMClient (stub by default), and
    publishes Attribution events to `attributions.{country}`. Foundation
    pass processes one anomaly at a time; sliding-window batching ships in
    the next iteration.
    """

    def __init__(self, bus: Bus, llm: LLMClient, kb: KB) -> None:
        self._bus = bus
        self._llm = llm
        self._kb = kb

    async def run(self) -> None:
        async for topic, event in self._bus.subscribe("anomalies.*"):
            if not isinstance(event, Anomaly):
                log.warning("attrib received non-Anomaly on %s: %r", topic, type(event))
                continue
            attribution = await self._llm.attribute([event], self._kb.all_entries())
            country = _country_topic(attribution.actor)
            await self._bus.publish(f"attributions.{country}", attribution)
            log.info(
                "attrib published id=%s actor=%s confidence=%.2f",
                attribution.id,
                attribution.actor,
                attribution.confidence,
            )
