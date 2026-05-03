from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

log = logging.getLogger(__name__)

__all__ = [
    "ApproachEvent",
    "ManeuverResult",
    "OrbitService",
    "LEO_MEAN_MOTION_RAD_S",
    "DEFAULT_DV_CAP_M_S",
    "DEFAULT_TARGET_MISS_KM",
    "DEFAULT_PLANNING_LEAD_S",
]


# Approximate mean motion for a LEO satellite (~91 minute orbit). Used as the
# default for relative-motion math when the friendly satellite's specific
# orbit is unknown. For GEO assets a different value would be passed in.
LEO_MEAN_MOTION_RAD_S = 1.08e-3

# Operational ceilings the recommender uses when sizing the burn. These are
# illustrative for the demo; real planning would consider the friendly's fuel
# budget and tasking ROE.
DEFAULT_DV_CAP_M_S = 5.0
DEFAULT_TARGET_MISS_KM = 100.0

# Default lead time used when a close-approach signal arrives without a
# time_of_closest_approach observable. 90 minutes ≈ one LEO orbit, the
# horizon over which a single prograde impulse fully accumulates.
DEFAULT_PLANNING_LEAD_S = 5400.0


@dataclass(frozen=True)
class ApproachEvent:
    sat_a: str
    sat_b: str
    closest_approach_km: float
    t_closest: datetime


@dataclass(frozen=True)
class ManeuverResult:
    sat: str
    dv_m_s: float
    t_burn: datetime
    pre_miss_km: float
    post_miss_km: float
    lead_seconds: float | None = None
    mean_motion_rad_s: float | None = None


def _prograde_impulse_displacement_m(
    dv_m_s: float, lead_s: float, n_rad_s: float = LEO_MEAN_MOTION_RAD_S
) -> float:
    """Magnitude of LVLH position change after a prograde Δv (Clohessy-Wiltshire).

    Hill's solutions for an impulsive prograde Δv at t=0, evaluated at time t:

      δr_radial(t)     = (2·Δv/n) · (1 − cos(n·t))
      δr_along(t)      = −3·Δv·t + (4·Δv/n) · sin(n·t)
      δr_normal(t)     = 0

    We return the magnitude of the radial+along-track displacement, which is
    the offset of the friendly from the unmanoeuvred reference orbit at t.
    Prograde is the direction that gives the largest secular drift, so it's
    the right default for separation maneuvers.
    """
    if lead_s <= 0 or dv_m_s == 0:
        return 0.0
    n = n_rad_s
    nt = n * lead_s
    radial = (2.0 * dv_m_s / n) * (1.0 - math.cos(nt))
    along = -3.0 * dv_m_s * lead_s + (4.0 * dv_m_s / n) * math.sin(nt)
    return math.hypot(radial, along)


def _recommend_dv(
    pre_miss_km: float,
    lead_s: float,
    *,
    target_miss_km: float = DEFAULT_TARGET_MISS_KM,
    dv_cap_m_s: float = DEFAULT_DV_CAP_M_S,
    n_rad_s: float = LEO_MEAN_MOTION_RAD_S,
) -> float:
    """Smallest prograde Δv (capped) that gets the new miss to target_miss_km.

    Solves new_miss = √(pre² + drift²) ≥ target for drift, then divides by
    the per-Δv displacement at the given lead time. Capped at dv_cap_m_s
    because real spacecraft have finite fuel and ROE.
    """
    if pre_miss_km >= target_miss_km:
        return 0.0
    if lead_s <= 0:
        return dv_cap_m_s
    needed_drift_m = math.sqrt(target_miss_km**2 - pre_miss_km**2) * 1000.0
    drift_per_unit_dv = _prograde_impulse_displacement_m(1.0, lead_s, n_rad_s)
    if drift_per_unit_dv <= 0:
        return dv_cap_m_s
    dv = needed_drift_m / drift_per_unit_dv
    return min(round(dv, 2), dv_cap_m_s)


class OrbitService:
    """Library facade over a tiny cached TLE bundle plus relative-motion math.

    Loads cached TLEs from ``data/tle_cache.json`` at startup using Skyfield.

    * ``propagate``, ``close_approach`` — Skyfield-backed propagation against
      cached TLEs.
    * ``simulate_maneuver`` — Clohessy-Wiltshire impulsive math; computes the
      new miss distance for a prograde burn given the pre-burn miss, the time
      of closest approach, and the burn time. Does **not** require both sats
      to be in the TLE catalog — operates on observables, which is what the
      scenario data carries.
    * ``recommended_dv`` — picks a Δv (capped at 5 m/s by default) that aims
      for ≥ 100 km separation. Used by ``DecideService`` to size the burn.
    """

    def __init__(self, tle_cache_path: str | Path = "data/tle_cache.json") -> None:
        from skyfield.api import EarthSatellite, load

        self._ts = load.timescale()
        cache_path = Path(tle_cache_path)
        if not cache_path.exists():
            log.warning("orbit: TLE cache missing at %s; service will be inert", cache_path)
            self._sats: dict[str, "EarthSatellite"] = {}
            return
        with cache_path.open() as f:
            cache = json.load(f)
        self._sats = {
            entry["name"]: EarthSatellite(entry["line1"], entry["line2"], entry["name"], self._ts)
            for entry in cache
        }
        log.info("orbit: loaded %d cached TLEs", len(self._sats))

    def known_satellites(self) -> list[str]:
        return sorted(self._sats.keys())

    def propagate(self, sat_id: str, t: datetime) -> tuple[float, float, float]:
        """Return ECI (km) position for the given satellite at time t."""
        sat = self._sats[sat_id]
        time = self._ts.from_datetime(t)
        position = sat.at(time).position.km
        return float(position[0]), float(position[1]), float(position[2])

    def close_approach(
        self, sat_a: str, sat_b: str, window: timedelta, *, t0: datetime | None = None
    ) -> ApproachEvent:
        """Brute-force closest-approach search at 60 s resolution."""
        ts = self._ts
        a, b = self._sats[sat_a], self._sats[sat_b]
        start = t0 or datetime.now(UTC)
        steps = max(int(window.total_seconds() // 60), 1)
        best_km = float("inf")
        best_t = start
        for i in range(steps + 1):
            t_i = start + timedelta(seconds=i * 60)
            time = ts.from_datetime(t_i)
            diff = a.at(time).position.km - b.at(time).position.km
            d = float((diff[0] ** 2 + diff[1] ** 2 + diff[2] ** 2) ** 0.5)
            if d < best_km:
                best_km = d
                best_t = t_i
        return ApproachEvent(sat_a=sat_a, sat_b=sat_b, closest_approach_km=best_km, t_closest=best_t)

    def simulate_maneuver(
        self,
        sat: str,
        dv_m_s: float,
        t_burn: datetime,
        *,
        against: str | None = None,
        pre_miss_km: float | None = None,
        t_tca: datetime | None = None,
        mean_motion_rad_s: float = LEO_MEAN_MOTION_RAD_S,
    ) -> ManeuverResult:
        """Compute post-burn miss using Clohessy-Wiltshire impulsive math.

        ``pre_miss_km`` is the predicted miss distance without the burn — the
        engine pulls it from the originating signal's observables. ``t_tca``
        is the time at which we want the new miss distance evaluated; if
        omitted, we assume one full orbit ahead of t_burn.

        Geometric simplification: the post-burn miss is
        ``√(pre² + |drift|²)`` under the assumption that the LVLH drift
        vector is roughly perpendicular to the original miss direction. Real
        operations would optimise burn direction against the inspector's
        relative-velocity vector; this is the conservative single-component
        approximation.
        """
        if pre_miss_km is None:
            pre_miss_km = 10.0  # placeholder when no observable miss

        if t_burn.tzinfo is None:
            t_burn = t_burn.replace(tzinfo=UTC)
        if t_tca is None:
            lead_s = DEFAULT_PLANNING_LEAD_S
        else:
            if t_tca.tzinfo is None:
                t_tca = t_tca.replace(tzinfo=UTC)
            lead_s = max(0.0, (t_tca - t_burn).total_seconds())

        drift_m = _prograde_impulse_displacement_m(dv_m_s, lead_s, mean_motion_rad_s)
        pre_m = pre_miss_km * 1000.0
        post_m = math.hypot(pre_m, drift_m)

        return ManeuverResult(
            sat=sat,
            dv_m_s=dv_m_s,
            t_burn=t_burn,
            pre_miss_km=round(pre_miss_km, 1),
            post_miss_km=round(post_m / 1000.0, 1),
            lead_seconds=lead_s,
            mean_motion_rad_s=mean_motion_rad_s,
        )

    def recommended_dv(
        self,
        pre_miss_km: float,
        lead_s: float,
        *,
        target_miss_km: float = DEFAULT_TARGET_MISS_KM,
        dv_cap_m_s: float = DEFAULT_DV_CAP_M_S,
        mean_motion_rad_s: float = LEO_MEAN_MOTION_RAD_S,
    ) -> float:
        return _recommend_dv(
            pre_miss_km,
            lead_s,
            target_miss_km=target_miss_km,
            dv_cap_m_s=dv_cap_m_s,
            n_rad_s=mean_motion_rad_s,
        )
