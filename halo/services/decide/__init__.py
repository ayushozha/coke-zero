from __future__ import annotations

import asyncio
import logging
from collections import OrderedDict
from datetime import UTC, datetime, timedelta

from halo.services.bus import Bus
from halo.services.llm import LLMClient
from halo.services.orbit import OrbitService
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

# Default maneuver magnitude and lead time used by the foundation-pass
# integration. The lead time is the offset before time-of-closest-approach
# at which the burn would execute. Values are illustrative; live planning
# would compute these from the orbital geometry.
_DEFAULT_DV_M_S = 1.2
_DEFAULT_BURN_LEAD = timedelta(minutes=6)
_ANOMALY_CACHE_SIZE = 256


class DecideService:
    """Decision-stage service.

    Subscribes to ``attributions.*``, calls ``LLMClient.decide(...)``, and
    publishes Decision events to ``decisions.{authority}``.

    When wired with an ``OrbitService`` (the default in :mod:`halo.cli`),
    request-authority Decisions whose attribution chain includes an
    ``orbital_rpo_risk`` anomaly get enriched: the ``request_packet`` gains
    a ``recommended_burn`` block plus ``pre_miss_km``/``post_miss_km`` so the
    operator's APPROVE card carries the actual maneuver math, not just words.
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

        t_burn = _resolve_burn_time(observables.get("time_of_closest_approach"))

        try:
            result = self._orbit.simulate_maneuver(
                friendly,
                dv_m_s=_DEFAULT_DV_M_S,
                t_burn=t_burn,
                against=inspector,
                pre_miss_km=pre_miss_km,
            )
        except Exception:
            log.exception("decide: simulate_maneuver failed for %s vs %s", friendly, inspector)
            return decision

        packet = dict(decision.request_packet or {})
        packet["recommended_burn"] = {
            "sat": result.sat,
            "against": inspector,
            "dv_m_s": result.dv_m_s,
            "t_burn_utc": result.t_burn.isoformat().replace("+00:00", "Z"),
        }
        packet["pre_miss_km"] = round(result.pre_miss_km, 1)
        packet["post_miss_km"] = round(result.post_miss_km, 1)
        return decision.model_copy(update={"request_packet": packet})


def _resolve_burn_time(tca_str: object) -> datetime:
    if isinstance(tca_str, str):
        try:
            tca = datetime.fromisoformat(tca_str.replace("Z", "+00:00"))
        except ValueError:
            return datetime.now(UTC)
        return tca - _DEFAULT_BURN_LEAD
    return datetime.now(UTC)
