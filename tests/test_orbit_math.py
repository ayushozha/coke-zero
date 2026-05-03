"""Tests for the Clohessy-Wiltshire impulsive math in OrbitService.

Pins the formula behavior so a regression in the math (or a unit-confusion
error) fails CI rather than silently shipping bad maneuver recommendations.
"""
from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta

import pytest

from halo.services.orbit import (
    DEFAULT_DV_CAP_M_S,
    DEFAULT_TARGET_MISS_KM,
    LEO_MEAN_MOTION_RAD_S,
    OrbitService,
    _prograde_impulse_displacement_m,
    _recommend_dv,
)


# Reference values computed from Hill's solutions for a 1.0 m/s prograde
# impulse at LEO mean motion. If the implementation drifts from CW these
# fail with a clear diff.
@pytest.mark.parametrize(
    "dv,lead_s,expected_m",
    [
        # No burn or no lead → no displacement
        (0.0, 600.0, 0.0),
        (1.0, 0.0, 0.0),
        # Short lead (380 s ≈ Beat-4.7-style lead, n·t ≈ 0.41 rad)
        (1.0, 380.0, 371.05),
        # Medium lead (870 s ≈ army-chain RPO lead, n·t ≈ 0.94 rad)
        (1.0, 870.0, 848.90),
        # Full orbit (5400 s, n·t ≈ 5.83 rad ≈ 334°) — secular along-track drift
        (1.0, 5400.0, 17815.90),
        # Linearity in dv: 5 m/s at 870 s = 5× the dv=1 result
        (5.0, 870.0, 4244.48),
    ],
)
def test_prograde_impulse_displacement_matches_cw_formula(
    dv: float, lead_s: float, expected_m: float
) -> None:
    actual = _prograde_impulse_displacement_m(dv, lead_s, LEO_MEAN_MOTION_RAD_S)
    assert actual == pytest.approx(expected_m, abs=0.5)


def test_displacement_is_linear_in_dv() -> None:
    base = _prograde_impulse_displacement_m(1.0, 1000.0, LEO_MEAN_MOTION_RAD_S)
    for dv in (0.5, 2.0, 5.0):
        assert _prograde_impulse_displacement_m(
            dv, 1000.0, LEO_MEAN_MOTION_RAD_S
        ) == pytest.approx(dv * base, rel=1e-6)


def test_recommend_dv_returns_zero_when_already_safe() -> None:
    # Already past the target → no burn needed.
    assert _recommend_dv(150.0, 5400.0, target_miss_km=100.0) == 0.0


def test_recommend_dv_caps_at_dv_cap() -> None:
    # Short lead, big required separation — cap kicks in.
    dv = _recommend_dv(8.6, 380.0, target_miss_km=100.0, dv_cap_m_s=5.0)
    assert dv == 5.0


def test_recommend_dv_picks_minimum_dv_when_under_cap() -> None:
    # Long lead → should hit target with a small dv.
    dv = _recommend_dv(9.1, 5400.0, target_miss_km=100.0, dv_cap_m_s=10.0)
    # Per-dv displacement at full-orbit lead is ~17.8 km, so achieving ~99.6
    # km of drift needs ~5.6 m/s. Allow a small tolerance.
    assert dv == pytest.approx(5.6, abs=0.2)


def test_simulate_maneuver_post_miss_never_below_pre() -> None:
    """The CW geometry assumption is sqrt(pre² + drift²) — always ≥ pre."""
    orbit = OrbitService()
    t_burn = datetime(2026, 6, 18, 14, 0, 0, tzinfo=UTC)
    t_tca = t_burn + timedelta(minutes=15)
    result = orbit.simulate_maneuver(
        "FRIENDLY",
        dv_m_s=2.0,
        t_burn=t_burn,
        against="INSPECTOR",
        pre_miss_km=8.6,
        t_tca=t_tca,
    )
    assert result.post_miss_km >= result.pre_miss_km


def test_simulate_maneuver_increases_with_lead_time() -> None:
    """More lead time → larger displacement → larger post-miss."""
    orbit = OrbitService()
    t_burn = datetime(2026, 6, 18, 14, 0, 0, tzinfo=UTC)
    short = orbit.simulate_maneuver(
        "F", 2.0, t_burn, against="I", pre_miss_km=10.0,
        t_tca=t_burn + timedelta(minutes=5),
    )
    long = orbit.simulate_maneuver(
        "F", 2.0, t_burn, against="I", pre_miss_km=10.0,
        t_tca=t_burn + timedelta(minutes=60),
    )
    assert long.post_miss_km > short.post_miss_km


def test_simulate_maneuver_naive_burn_at_tca_yields_zero_drift() -> None:
    """Burning at TCA leaves zero lead time → drift is zero, post == pre."""
    orbit = OrbitService()
    t = datetime(2026, 6, 18, 14, 0, 0, tzinfo=UTC)
    result = orbit.simulate_maneuver(
        "F", 5.0, t, against="I", pre_miss_km=8.6, t_tca=t,
    )
    assert result.post_miss_km == result.pre_miss_km


def test_simulate_maneuver_handles_naive_datetimes() -> None:
    """Inputs without tzinfo get coerced to UTC rather than crashing."""
    orbit = OrbitService()
    t_burn = datetime(2026, 6, 18, 14, 0, 0)  # naive
    t_tca = datetime(2026, 6, 18, 14, 30, 0)  # naive
    result = orbit.simulate_maneuver(
        "F", 1.0, t_burn, against="I", pre_miss_km=10.0, t_tca=t_tca,
    )
    assert result.post_miss_km > result.pre_miss_km
    assert result.lead_seconds == pytest.approx(1800.0)


def test_default_constants_are_documented() -> None:
    """Sanity: the constants the recommender uses haven't drifted silently."""
    assert DEFAULT_DV_CAP_M_S == 5.0
    assert DEFAULT_TARGET_MISS_KM == 100.0
    # LEO mean motion should round-trip to ~91 minute orbital period.
    period_min = 2 * math.pi / LEO_MEAN_MOTION_RAD_S / 60
    assert 80 < period_min < 100
