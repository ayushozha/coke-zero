from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

log = logging.getLogger(__name__)

__all__ = [
    "ApproachEvent",
    "ManeuverResult",
    "OrbitService",
]


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


# Foundation-pass scripted maneuver results, keyed on the sat pair we move
# apart. Real impulsive-maneuver math via Skyfield ships in the next pass.
_SCRIPTED_MANEUVERS: dict[tuple[str, str], tuple[float, float]] = {
    ("SATCOM-3", "SJ-21"): (8.0, 140.0),
    ("SATCOM-3", "ru_cosmos2576"): (12.0, 95.0),
    ("CANOPY-LEO-07", "UNKNOWN-RSO-441"): (8.6, 142.0),
}

# Typical separation gain (km) added to the observed miss distance when no
# scripted entry exists. A 1–2 m/s impulsive burn over a 6+ hour cycle yields
# this order of cross-track separation; the value is illustrative, not the
# output of real propagation.
_DEFAULT_SEPARATION_GAIN_KM = 130.0


class OrbitService:
    """Library facade over a tiny cached TLE bundle.

    Foundation pass: TLEs load via Skyfield from `data/tle_cache.json`.
    `simulate_maneuver` returns scripted before/after miss-distance results
    sufficient for the Beat 4.7 visualization. Real impulsive math and live
    CelesTrak refresh ship in the next iteration.
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
        """Brute-force closest-approach search at 60s resolution.

        Foundation-pass implementation. Real propagation refinement via
        Skyfield's vector math ships in the next iteration.
        """
        ts = self._ts
        a, b = self._sats[sat_a], self._sats[sat_b]
        start = t0 or datetime.now(UTC)
        steps = max(int(window.total_seconds() // 60), 1)
        best_km = float("inf")
        best_t = start
        for i in range(steps + 1):
            t_i = start + timedelta(seconds=i * 60)
            time = ts.from_datetime(t_i)
            diff = (a.at(time).position.km - b.at(time).position.km)
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
    ) -> ManeuverResult:
        """Foundation-pass scripted maneuver result.

        Lookup order: hand-pinned ``_SCRIPTED_MANEUVERS`` for (sat, against)
        wins. Otherwise, if ``pre_miss_km`` is supplied (typically pulled from
        the orbital_rpo_risk anomaly's observables), the post-burn distance is
        ``pre_miss_km + _DEFAULT_SEPARATION_GAIN_KM``. With neither, return
        a generic (10 km, 100 km) placeholder.
        """
        key = (sat, against or "")
        if key in _SCRIPTED_MANEUVERS:
            pre, post = _SCRIPTED_MANEUVERS[key]
        elif pre_miss_km is not None:
            pre = float(pre_miss_km)
            post = round(pre + _DEFAULT_SEPARATION_GAIN_KM, 1)
        else:
            pre, post = 10.0, 100.0
        return ManeuverResult(
            sat=sat,
            dv_m_s=dv_m_s,
            t_burn=t_burn,
            pre_miss_km=pre,
            post_miss_km=post,
        )
