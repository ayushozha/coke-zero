from halo.services.llm.validation import (
    UNCERTAINTY_ANCHOR,
    validate_and_repair_attribution,
    validate_and_repair_decision,
)


def test_attribution_appends_uncertainty_anchor() -> None:
    result = validate_and_repair_attribution(
        {
            "actor": "Unknown",
            "confidence": 0.31,
            "evidence": ["insufficient signal"],
            "kb_citations": [],
        }
    )

    assert result.was_modified
    assert result.repaired["kb_citations"] == [UNCERTAINTY_ANCHOR]


def test_named_actor_without_substantive_citation_is_downgraded() -> None:
    result = validate_and_repair_attribution(
        {
            "actor": "Multi-actor",
            "confidence": 0.68,
            "evidence": ["pattern is ambiguous"],
            "kb_citations": [],
        }
    )

    assert result.downgraded_to_unknown
    assert result.repaired["actor"] == "Unknown"
    assert result.repaired["confidence"] == 0.49
    assert UNCERTAINTY_ANCHOR in result.repaired["kb_citations"]


def test_named_actor_without_evidence_is_downgraded() -> None:
    result = validate_and_repair_attribution(
        {
            "actor": "Iran",
            "confidence": 0.62,
            "evidence": [],
            "kb_citations": ["kb-gps-jamming-001"],
        }
    )

    assert result.downgraded_to_unknown
    assert result.repaired["actor"] == "Unknown"
    assert result.repaired["confidence"] == 0.49
    assert result.repaired["evidence"]


def test_unknown_confidence_is_capped() -> None:
    result = validate_and_repair_attribution(
        {
            "actor": "Unknown",
            "confidence": 0.7,
            "evidence": ["ambiguous signal"],
            "kb_citations": [UNCERTAINTY_ANCHOR],
        }
    )

    assert result.repaired["confidence"] == 0.49


def test_multi_actor_confidence_is_capped_without_joint_kb() -> None:
    result = validate_and_repair_attribution(
        {
            "actor": "Multi-actor",
            "confidence": 0.9,
            "evidence": ["multi-domain pattern"],
            "kb_citations": ["kb-rpo-ambiguity-001", UNCERTAINTY_ANCHOR],
        }
    )

    assert result.repaired["confidence"] == 0.72


def test_request_decision_gets_stub_packet() -> None:
    repaired = validate_and_repair_decision(
        {
            "action": "sda_tasking",
            "target": "CANOPY-LEO-07",
            "rationale": "Request SDA retask.",
            "authority": "request",
            "request_packet": None,
        }
    )

    assert repaired["request_packet"]["to"] == "CJFSCC"
    assert repaired["request_packet"]["requested_effect"] == "sda_tasking"


def test_local_decision_clears_request_packet() -> None:
    repaired = validate_and_repair_decision(
        {
            "action": "passive_defense",
            "target": "UAS mesh",
            "rationale": "Local defensive posture.",
            "authority": "local",
            "request_packet": {"to": "CJFSCC"},
        }
    )

    assert repaired["request_packet"] is None
