"""Prompt scaffolds for the live Anthropic attribution agent.

Foundation-pass content. Real prompt engineering — calibrated confidence
language, doctrine-citation discipline, evidence-chain formatting — is the
next iteration's work and lands as a single-file change here.
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
        "Always cite KB entry ids that you actually consulted in `kb_citations`."
    ),
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["actor", "confidence", "evidence", "kb_citations"],
        "properties": {
            "actor": {
                "type": "string",
                "description": (
                    "Named adversary, e.g., 'Russia / GRU 26165' or 'China / PLA Aerospace Force'. "
                    "Use 'Unknown' when signal is insufficient."
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
                "description": "KB entry id of the closest matching doctrinal precedent, if any.",
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
        "You are CANOPY's attribution agent. Given a cluster of anomalies and a "
        "knowledge base of adversary systems and doctrine, return a calibrated "
        "attribution assessment via the submit_attribution tool. Cite the KB entries "
        "you consulted by id in kb_citations. Use 'Unknown' as the actor when signal "
        "is insufficient — do not invent attribution."
    )


def attribution_user_prompt(
    anomalies: list[Anomaly], kb_entries: Iterable[KBEntry]
) -> str:
    anomalies_blob = json.dumps(
        [a.model_dump(mode="json") for a in anomalies], indent=2
    )
    kb_blob = json.dumps(
        [e.model_dump(mode="json") for e in kb_entries], indent=2
    )
    return (
        f"## Anomalies\n```json\n{anomalies_blob}\n```\n\n"
        f"## Knowledge base\n```json\n{kb_blob}\n```\n\n"
        "Submit the attribution assessment via the submit_attribution tool."
    )
