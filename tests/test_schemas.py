from __future__ import annotations

import pytest
from pydantic import ValidationError

from halo.services.schemas.events import (
    Anomaly,
    Attribution,
    Decision,
    Signal,
)


def test_signal_roundtrip_json() -> None:
    s = Signal(
        domain="rf_ew",
        source="ground-rf-sensor-1",
        payload={"band": "GNSS"},
        confidence=0.9,
    )
    data = s.model_dump_json()
    parsed = Signal.model_validate_json(data)
    assert parsed == s


def test_event_id_and_ts_default() -> None:
    a = Signal(domain="cyber", source="x", payload={}, confidence=0.5)
    b = Signal(domain="cyber", source="x", payload={}, confidence=0.5)
    assert a.id != b.id
    assert a.ts <= b.ts or (b.ts - a.ts).total_seconds() < 1.0


def test_signal_is_frozen() -> None:
    s = Signal(domain="cyber", source="x", payload={}, confidence=0.5)
    with pytest.raises(ValidationError):
        s.confidence = 0.6  # type: ignore[misc]


def test_signal_rejects_bad_domain() -> None:
    with pytest.raises(ValidationError):
        Signal(
            domain="not_a_real_domain",  # type: ignore[arg-type]
            source="x",
            payload={},
            confidence=0.5,
        )


def test_signal_rejects_oob_confidence() -> None:
    with pytest.raises(ValidationError):
        Signal(domain="cyber", source="x", payload={}, confidence=1.5)


def test_anomaly_severity_enum() -> None:
    Anomaly(signal_ids=["a"], pattern="x", severity="med", summary="ok")
    with pytest.raises(ValidationError):
        Anomaly(
            signal_ids=["a"],
            pattern="x",
            severity="critical",  # type: ignore[arg-type]
            summary="ok",
        )


def test_attribution_defaults() -> None:
    a = Attribution(
        anomaly_ids=["x"],
        actor="Russia / GRU",
        confidence=0.8,
    )
    assert a.evidence == []
    assert a.kb_citations == []
    assert a.doctrine_match is None
    assert a.predicted_next is None


def test_decision_authority_and_action() -> None:
    d = Decision(
        attribution_id="x",
        action="active_defense_escort",
        target="SATCOM-3",
        rationale="Test rationale.",
        authority="request",
        request_packet={"to": "CJFSCC"},
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


def test_extra_fields_forbidden() -> None:
    with pytest.raises(ValidationError):
        Signal(
            domain="cyber",
            source="x",
            payload={},
            confidence=0.5,
            wat="bonus_field",  # type: ignore[call-arg]
        )
