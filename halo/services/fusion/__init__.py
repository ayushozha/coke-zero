from __future__ import annotations

import logging

from halo.services.bus import Bus
from halo.services.schemas.events import Anomaly, Severity, Signal

log = logging.getLogger(__name__)

__all__ = ["FusionService"]

CONFIDENCE_THRESHOLD = 0.7


def _severity_from_confidence(c: float) -> Severity:
    if c >= 0.9:
        return "high"
    if c >= 0.7:
        return "med"
    return "low"


class FusionService:
    """Detection-stage skeleton.

    Foundation pass: any Signal with confidence >= 0.7 produces an Anomaly
    with pattern='placeholder_high_confidence'. The real correlator (RF,
    GPS spoof, RPO close-approach, cyber probe burst) ships in the next
    iteration; the only role of this skeleton is to prove the topic
    contract works downstream.
    """

    def __init__(self, bus: Bus) -> None:
        self._bus = bus

    async def run(self) -> None:
        async for topic, event in self._bus.subscribe("signals.*"):
            if not isinstance(event, Signal):
                log.warning("fusion received non-Signal on %s: %r", topic, type(event))
                continue
            if event.confidence < CONFIDENCE_THRESHOLD:
                continue
            anomaly = Anomaly(
                signal_ids=[event.id],
                pattern="placeholder_high_confidence",
                severity=_severity_from_confidence(event.confidence),
                summary=(
                    f"High-confidence {event.domain} signal from {event.source} "
                    f"(c={event.confidence:.2f})"
                ),
            )
            await self._bus.publish(f"anomalies.{anomaly.pattern}", anomaly)
            log.info("fusion published anomaly id=%s pattern=%s", anomaly.id, anomaly.pattern)
