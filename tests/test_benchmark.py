"""Smoke tests for the benchmark harness (Phase 5).

The bench module replays scenarios through the engine and produces a
scorecard. The tests assert the *shape* of the scorecard (not specific
numbers) to avoid brittleness against stub-template changes.
"""
from __future__ import annotations

import asyncio

import pytest

from bench.run import _run, _seed_labels
from bench.scoring import (
    Scorecard,
    actor_match,
    authority_match,
    confidence_band,
    confidence_band_match,
    action_match,
)


def test_actor_match_handles_actor_head():
    assert actor_match("Russia / GRU", "russia")
    assert actor_match("CHINA / PLA SSF", "China")
    assert not actor_match("Iran", "Russia")


def test_action_authority_match_any_wildcard():
    assert action_match("active_defense_escort", "any")
    assert action_match("threat_warning", "*")
    assert authority_match("local", "any")


def test_confidence_band_buckets():
    assert confidence_band(0.30) == "low"
    assert confidence_band(0.60) == "med"
    assert confidence_band(0.85) == "high"
    assert confidence_band_match(0.60, "med")
    assert not confidence_band_match(0.30, "high")


def test_seed_labels_loads_at_least_eleven():
    labels = _seed_labels()
    assert len(labels) >= 11
    for label in labels:
        for required in (
            "file",
            "expected_actor",
            "expected_action",
            "expected_authority",
        ):
            assert required in label, f"label missing {required}"


def test_bench_run_against_subset_produces_scorecard():
    """Run the harness against the first 3 seeds; assert scorecard shape."""
    card: Scorecard = asyncio.run(
        _run(provider="stub", seeds_only=True, limit=3)
    )

    assert card.total == 3
    payload = card.to_dict()

    for key in (
        "total",
        "attribution_accuracy",
        "action_accuracy",
        "authority_accuracy",
        "calibration_rate",
        "latency_p50",
        "latency_p95",
        "confidence_means",
        "results",
    ):
        assert key in payload, f"scorecard missing {key}"

    assert payload["total"] == 3
    assert isinstance(payload["results"], list)
    assert len(payload["results"]) == 3
    for r in payload["results"]:
        assert "file" in r
        assert "actor_correct" in r
        assert "action_correct" in r
        assert "authority_correct" in r
        assert "latency_seconds" in r

    # The stub is deterministic — action + authority should always be
    # routed somewhere (no Nones) for these seeds because every scenario
    # produces at least one anomaly that triggers a decision.
    for r in payload["results"]:
        assert r["predicted_action"] is not None
        assert r["predicted_authority"] is not None

    # Latency budget is generous — even the heaviest seed should clear.
    assert payload["latency_p95"] < 30.0
