"""Prompt scaffolds for the live Anthropic attribution agent.

The schema and system prompt enforce the data lane's discipline: cite KB
entries by id, use "consistent with"/"confidence-scored" language, and use
"Unknown" when signal is insufficient.
"""
from __future__ import annotations

import json
from collections.abc import Iterable
from typing import Any

from halo.services.kb.models import KBEntry
from halo.services.schemas.events import Anomaly

ATTRIBUTION_TOOL: dict[str, Any] = {
    "name": "submit_attribution",
    "description": (
        "Submit the attribution assessment for the supplied anomaly cluster. "
        "Cite KB entry ids you actually consulted in `kb_citations`. Use "
        '"consistent with" and "confidence-scored assessment" language; do '
        'not say "proves".'
    ),
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["actor", "confidence", "evidence", "kb_citations"],
        "properties": {
            "actor": {
                "type": "string",
                "description": (
                    "Named adversary, e.g., 'Russia', 'China', 'Iran', 'DPRK', "
                    "'Multi-actor', or 'Unknown'. Use 'Unknown' when signal is "
                    "insufficient."
                ),
            },
            "confidence": {
                "type": "number",
                "minimum": 0.0,
                "maximum": 1.0,
                "description": "Calibrated confidence in [0, 1].",
            },
            "doctrine_match": {
                "type": ["string", "null"],
                "description": "KB entry id of the closest matching precedent, if any.",
            },
            "evidence": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Human-readable evidence chain, one bullet per item.",
            },
            "predicted_next": {
                "type": ["string", "null"],
                "description": "One-sentence forecast of the adversary's next move.",
            },
            "kb_citations": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of KB entry ids that grounded this assessment.",
            },
        },
    },
}


def attribution_system_prompt() -> str:
    return (
        "You are CANOPY's attribution agent. Given a cluster of canonical "
        "anomalies and a knowledge base of doctrinally grounded threat "
        "concepts, return a calibrated attribution via the submit_attribution "
        "tool.\n\n"
        "Discipline:\n"
        "- Cite the KB entries you consulted by id in kb_citations.\n"
        "- Always include kb-attribution-uncertainty-001 as a caveat anchor.\n"
        '- Use "consistent with" or "confidence-scored assessment"; do not '
        'say "proves".\n'
        "- When signal is insufficient, set actor to 'Unknown' and lower "
        "confidence rather than inventing attribution."
    )


def attribution_user_prompt(
    anomalies: list[Anomaly], kb_entries: Iterable[KBEntry]
) -> str:
    anomalies_blob = json.dumps(
        [a.model_dump(mode="json") for a in anomalies], indent=2, default=str
    )
    kb_blob = json.dumps(
        [e.model_dump(mode="json") for e in kb_entries], indent=2, default=str
    )
    return (
        f"## Anomalies\n```json\n{anomalies_blob}\n```\n\n"
        f"## Knowledge base\n```json\n{kb_blob}\n```\n\n"
        "Submit the attribution assessment via the submit_attribution tool."
    )
