"""Reasoning trace fanout.

Every visible step in the Sense → Attribute → Decide pipeline emits a
:class:`ReasoningTrace` to the bus on topic ``traces.{stage}``. The frontend
subscribes via the gateway's WebSocket fanout and renders the stream in a
terminal-styled panel; the resulting log is the auditable explanation of
why the engine arrived at its assessment.

The :class:`Tracer` is a thin façade so services do not have to know the
topic naming convention or how to build the event. One Tracer is shared
across all services, wired in :func:`coke_zero._engine.build_engine`.
"""
from __future__ import annotations

import logging
from typing import Any

from coke_zero.services.bus import Bus
from coke_zero.services.schemas.events import ReasoningTrace, TraceLevel, TraceStage

log = logging.getLogger(__name__)

__all__ = ["Tracer"]


class Tracer:
    """Façade that publishes ReasoningTrace events on ``traces.{stage}``."""

    def __init__(self, bus: Bus) -> None:
        self._bus = bus

    async def emit(
        self,
        stage: TraceStage,
        level: TraceLevel,
        message: str,
        ref_id: str | None = None,
        **payload: Any,
    ) -> None:
        trace = ReasoningTrace(
            stage=stage,
            level=level,
            message=message,
            ref_id=ref_id,
            payload=dict(payload),
        )
        await self._bus.publish(f"traces.{stage}", trace)
        log.debug(
            "trace stage=%s level=%s ref=%s msg=%s",
            stage,
            level,
            ref_id,
            message,
        )
