from __future__ import annotations

import asyncio
import logging
from collections import OrderedDict
from datetime import UTC, datetime, timedelta

from halo.services.bus import Bus
from halo.services.llm import LLMClient
from halo.services.orbit import (
    MIN_OPERATIONAL_LEAD_S,
    OrbitService,
)
from halo.services.schemas.events import Action, Anomaly, Attribution, Decision

log = logging.getLogger(__name__)

__all__ = ["DecideService"]


# Request-authority actions whose request_packet should be enriched with
# orbital maneuver math when an orbital_rpo_risk anomaly is in the cluster.
_ORBIT_ENRICHED_ACTIONS: set[Action] = {
    "active_defense_escort",
    "active_defense_counterattack",
    "orbital_strike_request",
}

# Time the engine reserves between detecting the threat and executing the
# burn — represents authorization + maneuver-prep latency. The engine
# computes burn time as ``anomaly.ts + AUTHORIZATION_LATENCY``.
_AUTHORIZATION_LATENCY = timedelta(seconds=60)

_ANOMALY_CACHE_SIZE = 256


class DecideService:
    """Decision-stage service.

    Subscribes to ``attributions.*``, calls ``LLMClient.decide(...)``, and
    publishes Decision events to ``decisions.{authority}``.

    When wired with an ``OrbitService`` (the default in :mod:`halo.cli`),
    request-authority Decisions whose attribution chain includes an
    ``orbital_rpo_risk`` anomaly get enriched: the ``request_packet`` gains
    a ``recommended_burn`` block plus ``pre_miss_km`` / ``post_miss_km``.
    The Δv is sized by ``OrbitService.recommended_dv`` against the lead time
    available from the originating signal's TCA observable, and the new miss
    distance is computed via Clohessy-Wiltshire impulsive math.
    """

    def __init__(
        self,
        bus: Bus,
        llm: LLMClient,
        *,
        orbit: OrbitService | None = None,
        anomaly_cache_size: int = _ANOMALY_CACHE_SIZE,
    ) -> None:
        self._bus = bus
        self._llm = llm
        self._orbit = orbit
        self._anomaly_cache: OrderedDict[str, Anomaly] = OrderedDict()
        self._cache_size = anomaly_cache_size

    async def run(self) -> None:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(self._consume_anomalies(), name="decide-anomalies")
            tg.create_task(self._consume_attributions(), name="decide-attributions")

    async def _consume_anomalies(self) -> None:
        async for _, event in self._bus.subscribe("anomalies.*"):
            if not isinstance(event, Anomaly):
                continue
            self._anomaly_cache[event.id] = event
            self._anomaly_cache.move_to_end(event.id)
            while len(self._anomaly_cache) > self._cache_size:
                self._anomaly_cache.popitem(last=False)

    async def _consume_attributions(self) -> None:
        async for topic, event in self._bus.subscribe("attributions.*"):
            if not isinstance(event, Attribution):
                log.warning(
                    "decide received non-Attribution on %s: %r", topic, type(event)
                )
                continue
            try:
                decision = await self._llm.decide(event)
            except Exception:
                log.exception(
                    "decide: LLMClient.decide failed for attribution=%s", event.id
                )
                continue
            decision = self._maybe_enrich_with_orbit(decision, event)
            await self._bus.publish(f"decisions.{decision.authority}", decision)
            log.info(
                "decide published id=%s action=%s authority=%s",
                decision.id,
                decision.action,
                decision.authority,
            )

    # ---- Maneuver enrichment ---------------------------------------------

    def _maybe_enrich_with_orbit(
        self, decision: Decision, attribution: Attribution
    ) -> Decision:
        if self._orbit is None:
            return decision
        if decision.authority != "request":
            return decision
        if decision.action not in _ORBIT_ENRICHED_ACTIONS:
            return decision
        rpo = self._find_rpo_anomaly(attribution)
        if rpo is None:
            return decision
        return self._apply_maneuver(decision, rpo)

    def _find_rpo_anomaly(self, attribution: Attribution) -> Anomaly | None:
        for aid in attribution.anomaly_ids:
            anomaly = self._anomaly_cache.get(aid)
            if anomaly is not None and anomaly.kind == "orbital_rpo_risk":
                return anomaly
        return None

    def _apply_maneuver(self, decision: Decision, rpo: Anomaly) -> Decision:
        observables = (rpo.payload.get("observables") or {}) if rpo.payload else {}
        friendly = observables.get("target") or rpo.payload.get("satellite")
        inspector = rpo.payload.get("asset") or observables.get("asset")
        if not friendly or not inspector:
            log.debug(
                "decide: skipping orbit enrichment — could not identify "
                "friendly/inspector pair from anomaly %s",
                rpo.id,
            )
            return decision

        pre_miss_km = observables.get("miss_distance_km")
        if pre_miss_km is None:
            pre_miss_km = observables.get("range_km")
        if pre_miss_km is None:
            pre_miss_km = 10.0  # placeholder when neither observable is set

        t_tca = _parse_tca(observables.get("time_of_closest_approach"))
        signal_burn_time = _ensure_utc(rpo.ts) + _AUTHORIZATION_LATENCY

        # The "actual" lead is what the engine would have between the signal
        # arriving and the close approach. Real conjunction analysis provides
        # hours of advance notice though, so we floor the lead at
        # MIN_OPERATIONAL_LEAD_S — that's the planning horizon a real cell
        # would have. The maneuver math represents what the operator could
        # achieve with that horizon, not what they could achieve in the
        # seconds remaining of a compressed scenario timeline.
        if t_tca is not None:
            actual_lead_s = max(0.0, (t_tca - signal_burn_time).total_seconds())
            effective_lead_s = max(actual_lead_s, MIN_OPERATIONAL_LEAD_S)
            t_burn = t_tca - timedelta(seconds=effective_lead_s)
        else:
            actual_lead_s = None
            effective_lead_s = MIN_OPERATIONAL_LEAD_S
            t_burn = signal_burn_time

        dv_m_s = self._orbit.recommended_dv(pre_miss_km, effective_lead_s)

        try:
            result = self._orbit.simulate_maneuver(
                friendly,
                dv_m_s=dv_m_s,
                t_burn=t_burn,
                against=inspector,
                pre_miss_km=pre_miss_km,
                t_tca=t_tca,
            )
        except Exception:
            log.exception(
                "decide: simulate_maneuver failed for %s vs %s", friendly, inspector
            )
            return decision

        packet = dict(decision.request_packet or {})
        packet["recommended_burn"] = {
            "sat": result.sat,
            "against": inspector,
            "dv_m_s": result.dv_m_s,
            "t_burn_utc": _format_utc(result.t_burn),
            "lead_seconds": round(result.lead_seconds, 0)
            if result.lead_seconds is not None
            else None,
            "actual_lead_seconds": round(actual_lead_s, 0)
            if actual_lead_s is not None
            else None,
        }
        packet["pre_miss_km"] = result.pre_miss_km
        packet["post_miss_km"] = result.post_miss_km
        return decision.model_copy(update={"request_packet": packet})


def _ensure_utc(ts: datetime) -> datetime:
    return ts if ts.tzinfo is not None else ts.replace(tzinfo=UTC)


def _parse_tca(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _format_utc(t: datetime) -> str:
    if t.tzinfo is None:
        t = t.replace(tzinfo=UTC)
    return t.astimezone(UTC).isoformat().replace("+00:00", "Z")
