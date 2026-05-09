from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from coke_zero.services.schemas.events import (
    Anomaly,
    Attribution,
    Decision,
    Location,
    Provenance,
    Recommendation,
    Signal,
    UIEvent,
)

ROOT = Path(__file__).resolve().parent.parent


def _signal_kwargs(**overrides) -> dict:
    base = {
        "domain": "rf_ew",
        "source": "spectrum-monitor-guam",
        "realism": "mock_operational",
        "confidence": 0.86,
        "location": Location(label="Guam RF site", lat=13.5, lng=144.8),
        "payload": {
            "event_type": "rf_interference",
            "summary": "RF interference",
        },
        "provenance": Provenance(source_id="coke-zero-demo-feed-worker"),
    }
    base.update(overrides)
    return base


def test_canonical_scenario_signals_validate() -> None:
    paths = sorted((ROOT / "scenarios").glob("*.jsonl"))
    assert paths, "expected checked-in scenario files"
    total = 0
    for path in paths:
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line:
                continue
            sig = Signal.model_validate_json(line)
            assert sig.payload.event_type
            assert sig.realism in (
                "real_source",
                "mock_operational",
                "synthetic_orbital_overlay",
            )
            assert sig.provenance.source_id
            total += 1
    assert total > 0


def test_signal_minimum_required_fields() -> None:
    s = Signal(**_signal_kwargs())
    data = s.model_dump_json()
    parsed = Signal.model_validate_json(data)
    assert parsed.domain == s.domain
    assert parsed.payload.event_type == "rf_interference"


def test_signal_rejects_bad_domain() -> None:
    with pytest.raises(ValidationError):
        Signal(**_signal_kwargs(domain="not_a_real_domain"))


def test_signal_rejects_oob_confidence() -> None:
    with pytest.raises(ValidationError):
        Signal(**_signal_kwargs(confidence=1.5))


def test_location_requires_localizer() -> None:
    Location(label="abstract")
    Location(lat=10.0, lng=20.0)
    Location(mgrs="42SXG12345678")
    with pytest.raises(ValidationError):
        Location()


def test_provenance_source_id_required() -> None:
    Provenance(source_id="x")
    with pytest.raises(ValidationError):
        Provenance(source_id="")


def test_anomaly_canonical_shape() -> None:
    a = Anomaly(
        kind="rf_anomaly",
        source_signal="sig-1",
        source_signal_ids=["sig-1"],
        severity=0.82,
        payload={"summary": "RF interference"},
    )
    blob = a.model_dump_json()
    parsed = Anomaly.model_validate_json(blob)
    assert parsed.kind == "rf_anomaly"
    assert 0.0 <= parsed.severity <= 1.0


def test_anomaly_severity_bounds() -> None:
    with pytest.raises(ValidationError):
        Anomaly(
            kind="x",
            source_signal="s",
            source_signal_ids=["s"],
            severity=1.5,
            payload={},
        )


def test_attribution_carries_source_signal_ids() -> None:
    a = Attribution(
        anomaly_ids=["anom-1"],
        actor="Russia",
        confidence=0.78,
        evidence=["consistent with Russian EW"],
        kb_citations=["kb-gps-jamming-001"],
        source_signal_ids=["coke-zero-beat2-001"],
    )
    assert a.source_signal_ids == ["coke-zero-beat2-001"]


def test_decision_action_and_authority() -> None:
    d = Decision(
        attribution_id="attr-1",
        action="active_defense_escort",
        target="threatened_geo_asset",
        rationale="Test",
        authority="request",
        request_packet={"to": "CJFSCC"},
        source_signal_ids=["coke-zero-beat47-002"],
    )
    assert d.authority == "request"
    with pytest.raises(ValidationError):
        Decision(
            attribution_id="x",
            action="not_a_valid_action",  # type: ignore[arg-type]
            target="x",
            rationale="x",
            authority="local",
        )


def test_uievent_validates_against_data_fixture() -> None:
    fixture = json.loads((ROOT / "data" / "expected_ui_events.json").read_text())
    parsed = [UIEvent.model_validate(e) for e in fixture["events"]]
    assert len(parsed) == len(fixture["events"])
    rec_types = {e.type for e in parsed}
    assert "threat_updated" in rec_types
    assert "recommendation_created" in rec_types


def test_recommendation_default_label() -> None:
    r = Recommendation(id="rec-1", summary="x")
    assert r.approveLabel == "APPROVE"
