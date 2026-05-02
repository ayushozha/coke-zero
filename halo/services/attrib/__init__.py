from __future__ import annotations

import asyncio
import logging

from halo.services.bus import Bus
from halo.services.kb import KB
from halo.services.llm import LLMClient
from halo.services.schemas.events import Anomaly

log = logging.getLogger(__name__)

__all__ = ["AttribService"]

DEFAULT_WINDOW_S = 2.0


def _country_topic(actor: str) -> str:
    head = actor.split("/", 1)[0].strip().lower()
    return head.replace(" ", "_") or "unknown"


class AttribService:
    """Attribution-stage service.

    Subscribes to ``anomalies.*`` and batches anomalies in a small sliding
    window before calling ``LLMClient.attribute(...)``. The window lets a
    coordinated cross-domain cluster (RF + cyber + PNT, for example) attribute
    as a single campaign rather than each leg in isolation. Set
    ``window_s=0`` to attribute each anomaly immediately (used in tests).
    """

    def __init__(
        self,
        bus: Bus,
        llm: LLMClient,
        kb: KB,
        *,
        window_s: float = DEFAULT_WINDOW_S,
    ) -> None:
        self._bus = bus
        self._llm = llm
        self._kb = kb
        self._window_s = window_s

    async def run(self) -> None:
        buffer: list[Anomaly] = []
        flush_task: asyncio.Task | None = None

        async def flush() -> None:
            await asyncio.sleep(self._window_s)
            if not buffer:
                return
            batch = list(buffer)
            buffer.clear()
            await self._process(batch)

        try:
            async for topic, event in self._bus.subscribe("anomalies.*"):
                if not isinstance(event, Anomaly):
                    log.warning(
                        "attrib received non-Anomaly on %s: %r", topic, type(event)
                    )
                    continue
                if self._window_s <= 0:
                    await self._process([event])
                    continue
                buffer.append(event)
                if flush_task is None or flush_task.done():
                    flush_task = asyncio.create_task(flush())
        finally:
            if flush_task is not None and not flush_task.done():
                flush_task.cancel()

    async def _process(self, anomalies: list[Anomaly]) -> None:
        # KB context: union of entries indexed by the source signal ids of
        # this batch. Falls back to all entries if no scenario hits.
        seen: set[str] = set()
        context = []
        for a in anomalies:
            for sid in a.source_signal_ids:
                for entry in self._kb.by_scenario_signal_id(sid):
                    if entry.id not in seen:
                        context.append(entry)
                        seen.add(entry.id)
        if not context:
            context = self._kb.all_entries()

        try:
            attribution = await self._llm.attribute(anomalies, context)
        except Exception:
            log.exception("attrib: LLMClient.attribute failed for batch of %d", len(anomalies))
            return

        country = _country_topic(attribution.actor)
        await self._bus.publish(f"attributions.{country}", attribution)
        log.info(
            "attrib published id=%s actor=%s confidence=%.2f signals=%d",
            attribution.id,
            attribution.actor,
            attribution.confidence,
            len(attribution.source_signal_ids),
        )
