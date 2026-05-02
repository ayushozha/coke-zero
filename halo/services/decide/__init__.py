from __future__ import annotations

import logging

from halo.services.bus import Bus
from halo.services.llm import LLMClient
from halo.services.schemas.events import Attribution

log = logging.getLogger(__name__)

__all__ = ["DecideService"]


class DecideService:
    """Decision-stage skeleton.

    Subscribes to `attributions.*`, calls the LLMClient (stub by default),
    and publishes Decision events to `decisions.{authority}`. The hardcoded
    authority mapping lives inside the stub for foundation; the live agent
    can override per-call.
    """

    def __init__(self, bus: Bus, llm: LLMClient) -> None:
        self._bus = bus
        self._llm = llm

    async def run(self) -> None:
        async for topic, event in self._bus.subscribe("attributions.*"):
            if not isinstance(event, Attribution):
                log.warning("decide received non-Attribution on %s: %r", topic, type(event))
                continue
            decision = await self._llm.decide(event)
            await self._bus.publish(f"decisions.{decision.authority}", decision)
            log.info(
                "decide published id=%s action=%s authority=%s",
                decision.id,
                decision.action,
                decision.authority,
            )
