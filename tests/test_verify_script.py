from __future__ import annotations

from pathlib import Path

from scripts.verify import DRAIN_LIVE_S, _should_require_recommendation


def test_verify_requires_recommendation_for_request_scenarios() -> None:
    assert _should_require_recommendation(
        [Path("scenarios/iran_counter_c5isr_brigade.jsonl")], "auto", live=False
    )
    assert _should_require_recommendation(
        [Path("scenarios/army_multidomain_attack_chain.jsonl")], "auto", live=False
    )
    assert _should_require_recommendation(
        [Path("scenarios/beat47.jsonl")], "auto", live=False
    )


def test_verify_allows_signal_flow_scenarios_without_recommendation() -> None:
    assert not _should_require_recommendation([Path("scenarios/beat1.jsonl")], "auto")
    assert not _should_require_recommendation([Path("scenarios/beat2.jsonl")], "auto")
    assert not _should_require_recommendation(
        [Path("scenarios/army_drone_fdir.jsonl")], "auto"
    )


def test_verify_recommendation_policy_override() -> None:
    setup_scenario = [Path("scenarios/beat1.jsonl")]
    request_scenario = [Path("scenarios/beat47.jsonl")]

    assert _should_require_recommendation(setup_scenario, "always")
    assert not _should_require_recommendation(request_scenario, "never")


def test_live_auto_policy_checks_pipeline_not_model_choice() -> None:
    assert not _should_require_recommendation(
        [Path("scenarios/iran_counter_c5isr_brigade.jsonl")], "auto", live=True
    )
    assert _should_require_recommendation(
        [Path("scenarios/iran_counter_c5isr_brigade.jsonl")], "always", live=True
    )


def test_live_drain_default_allows_llm_round_trips() -> None:
    assert DRAIN_LIVE_S >= 30
