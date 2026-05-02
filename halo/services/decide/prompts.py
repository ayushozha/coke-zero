"""Prompt scaffolds for the live Anthropic decision agent.

Foundation-pass content. Real prompt engineering — commander's-intent
threading, supporting/supported routing language, ROE alignment — is the
next iteration's work.
"""
from __future__ import annotations

from typing import Any

from halo.services.schemas.events import Attribution

DECISION_TOOL: dict[str, Any] = {
    "name": "submit_decision",
    "description": (
        "Submit the recommended action for the supplied attribution. Use "
        "authority='request' when the action exceeds local authority and must "
        "route to the CJFSCC for engagement authority."
    ),
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["action", "target", "rationale", "authority"],
        "properties": {
            "action": {
                "type": "string",
                "enum": [
                    "passive_defense",
                    "active_defense_escort",
                    "active_defense_counterattack",
                    "orbital_strike_request",
                    "terrestrial_strike_request",
                    "space_link_interdiction_request",
                    "sda_tasking",
                    "threat_warning",
                ],
            },
            "target": {
                "type": "string",
                "description": "Friendly asset or unit the action applies to.",
            },
            "rationale": {
                "type": "string",
                "description": "One sentence carrying commander's intent.",
            },
            "authority": {
                "type": "string",
                "enum": ["local", "request"],
            },
            "request_packet": {
                "type": ["object", "null"],
                "description": (
                    "Populated when authority='request'. Minimal CJFSCC routing "
                    "envelope: to, supporting_supported, justification, actor, confidence."
                ),
            },
        },
    },
}


def decision_system_prompt() -> str:
    return (
        "You are CANOPY's decision agent. Given an attribution, recommend the "
        "appropriate counterspace action via the submit_decision tool. Honor the "
        "doctrinal split: 'local' authority means the brigade can execute now; "
        "'request' authority means the action exceeds local authority and must "
        "route to the CJFSCC for engagement authority. Always populate request_packet "
        "when authority='request'."
    )


def decision_user_prompt(attribution: Attribution) -> str:
    return (
        "## Attribution\n"
        f"```json\n{attribution.model_dump_json(indent=2)}\n```\n\n"
        "Submit the recommended decision via the submit_decision tool."
    )
