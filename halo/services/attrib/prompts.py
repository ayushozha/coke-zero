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
from halo.services.schemas.events import Anomaly, Attribution, AttributionChallenge

ATTRIBUTION_TOOL: dict[str, Any] = {
    "name": "submit_attribution",
    "description": (
        "Submit the attribution assessment for the supplied anomaly cluster. "
        "REQUIRED: kb_citations must ALWAYS contain at least "
        "'kb-attribution-uncertainty-001'. If kb_citations would be empty, "
        "set actor='Unknown' and confidence below 0.50 instead. "
        "Cite KB entry ids you actually consulted. "
        "Language must reflect Space Warfighting (USSF, March 2025) and SDP 3-101 "
        "assessment standards: use calibrated, hedged language tied to observable "
        "signal patterns. Do not assert certainty beyond what the evidence supports."
    ),
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["actor", "confidence", "evidence", "kb_citations"],
        "properties": {
            "actor": {
                "type": "string",
                "description": (
                    "Named adversary or actor category. Use the most specific "
                    "attribution the evidence supports: 'Russia / GRU', "
                    "'China / PLA SSF', 'Iran', 'DPRK', "
                    "'Multi-actor' (when signals implicate more than one state "
                    "and cannot be resolved to one), or "
                    "'Unknown' when signal is insufficient to attribute. "
                    "RULE: If kb_citations contains only "
                    "'kb-attribution-uncertainty-001' and no other entries, "
                    "actor MUST be 'Unknown'. "
                    "Do not collapse multi-actor situations into a single actor."
                ),
            },
            "confidence": {
                "type": "number",
                "minimum": 0.0,
                "maximum": 1.0,
                "description": (
                    "Calibrated confidence in [0, 1]. Reflect genuine uncertainty. "
                    "Tier mapping — use this exactly:\n"
                    "  0.00-0.49: insufficient signal; actor must be 'Unknown'\n"
                    "  0.50-0.74: pattern consistent with actor; alternatives viable\n"
                    "  0.75-0.89: assessed as likely; strong KB pattern match\n"
                    "  0.90-1.00: high confidence; multiple corroborating domains\n"
                    "Multi-actor assessments must not exceed 0.72 without a "
                    "KB-documented joint exercise precedent between those actors. "
                    "Do not anchor high — uncertainty is the default state."
                ),
            },
            "doctrine_match": {
                "type": ["string", "null"],
                "description": (
                    "KB entry id of the closest matching precedent, if any. "
                    "Plain string id only — no extra quoting or escaping. "
                    "Example: 'kb-ru-pole21-rf' not '\"kb-ru-pole21-rf\"'. "
                    "Null if no KB entry matches. Do not fabricate a match."
                ),
            },
            "evidence": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Human-readable evidence chain, one item per signal or KB match. "
                    "Each item must name: the affected Space Warfighting segment "
                    "(orbital / link / terrestrial), the observable characteristic, "
                    "and the KB entry or pattern it maps to. "
                    "Language must match the confidence tier:\n"
                    "  0.00-0.49 → 'may indicate', 'insufficient to assess'\n"
                    "  0.50-0.74 → 'consistent with', 'pattern associated with'\n"
                    "  0.75-0.89 → 'assessed as consistent with'\n"
                    "  0.90+     → 'assessed with high confidence'\n"
                    "PROHIBITED in evidence text unless evidence_type is "
                    "'direct_observation' AND confidence >= 0.90: "
                    "'confirmed', 'proves', 'demonstrates', 'credible coordinated "
                    "threat', 'definitively', 'certain'. "
                    "The final evidence item must always state the uncertainty caveat: "
                    "'Alternative explanations have not been ruled out. "
                    "kb-attribution-uncertainty-001 applies.'"
                ),
            },
            "predicted_next": {
                "type": ["string", "null"],
                "description": (
                    "One-sentence forecast of the adversary's likely next move. "
                    "Must be grounded in the matched KB entry's doctrine field. "
                    "Must use hedged language: 'doctrine suggests', "
                    "'precedent indicates', 'pattern is consistent with'. "
                    "Null if no KB doctrine field supports the forecast. "
                    "Do not speculate without KB backing."
                ),
            },
            "kb_citations": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": 1,
                "description": (
                    "List of KB entry ids that grounded this assessment. "
                    "ALWAYS include 'kb-attribution-uncertainty-001' — this is "
                    "non-negotiable and must appear in every submission. "
                    "If no other KB entry matched the signals, return "
                    "['kb-attribution-uncertainty-001'] and set actor='Unknown'. "
                    "A named actor (non-Unknown) without KB citation support "
                    "is an INVALID output."
                ),
            },
        },
    },
}


def attribution_system_prompt() -> str:
    return (
        "You are CANOPY's attribution agent operating at the unclassified tactical edge.\n\n"

        "## MISSION\n"
        "Produce calibrated, doctrine-grounded adversary attribution assessments from "
        "fused multi-domain anomaly signals. You are not a classified all-source fusion "
        "system. You provide the brigade commander a fast, unclassified initial picture "
        "they currently have no access to on a tactical timeline. Your value is speed and "
        "domain fusion. Your discipline is not overclaiming.\n\n"

        "## DOCTRINAL GROUNDING\n"
        "Your assessments implement the attribution requirements of Space Warfighting "
        "(USSF, March 2025) and SDP 3-101 Targeting (Sep 2024). Space Warfighting states: "
        "'a credible, known, and trusted attribution process underpins a successful "
        "deterrence strategy.' That standard requires honesty about uncertainty, not "
        "just confident-sounding language.\n"
        "SDP 3-101 establishes that targeting is 'inherently estimative and anticipatory.' "
        "Your attribution is an estimate, not a verdict. Every assessment carries "
        "implicit second- and third-order uncertainty.\n\n"

        "## HARD RULES — CHECK BEFORE SUBMITTING\n"
        "These rules override everything else. Verify all four before calling the tool:\n"
        "  1. kb_citations must contain 'kb-attribution-uncertainty-001'. Always.\n"
        "     If you are about to submit with kb_citations=[], STOP. Add the uncertainty "
        "     anchor and set actor='Unknown' if no other KB entry matched.\n"
        "  2. A named actor (anything except 'Unknown') requires at least one KB citation "
        "     beyond kb-attribution-uncertainty-001. No citation = actor must be 'Unknown'.\n"
        "  3. Prohibited phrases in any field: 'confirmed', 'proves', 'demonstrates', "
        "     'credible coordinated threat pattern', 'definitively', 'certain'. "
        "     Replace with tier-appropriate hedged language.\n"
        "  4. The final evidence item must always state: "
        "     'Alternative explanations have not been ruled out. "
        "     kb-attribution-uncertainty-001 applies.'\n\n"

        "## CONFIDENCE VOCABULARY — APPLY EXACTLY\n"
        "Map score to language. Do not use stronger language than your tier allows:\n"
        "  0.00-0.49 → 'may indicate', 'insufficient signal to attribute', "
        "'cannot resolve actor from available evidence'\n"
        "  0.50-0.74 → 'consistent with', 'pattern is associated with', "
        "'assessed as possibly attributable to'\n"
        "  0.75-0.89 → 'assessed as', 'assessed as consistent with [actor] activity'\n"
        "  0.90-1.00 → 'assessed with high confidence' — only with direct observable "
        "signal across multiple corroborating domains\n\n"

        "## SEGMENT VOCABULARY\n"
        "Use Space Warfighting's three-segment taxonomy in every evidence item:\n"
        "  Orbital segment — spacecraft, RPO, on-orbit maneuvering\n"
        "  Link segment — uplink, downlink, crosslink, EMS interference, jamming, spoofing\n"
        "  Terrestrial segment — ground stations, user terminals, UAS, cyber access points\n"
        "Signal clustering across multiple segments raises attribution confidence and "
        "must be noted explicitly.\n\n"

        "## MULTI-ACTOR SITUATIONS\n"
        "When signals implicate more than one adversary in the same window:\n"
        "  - Do NOT collapse to a single actor.\n"
        "  - Set actor to 'Multi-actor' or name the dominant primary.\n"
        "  - State in evidence: 'Cannot resolve single actor; signals assessed as "
        "consistent with coordinated or coincident activity by [Actor A] and [Actor B].'\n"
        "  - Hard cap: confidence must not exceed 0.72 unless a KB entry documents "
        "a joint exercise precedent between those specific actors.\n\n"

        "## KB CITATION DISCIPLINE\n"
        "  - Cite only entries you actually matched against the signals.\n"
        "  - Reference the specific KB field (system, signature, or doctrine) that matched.\n"
        "  - doctrine_match: plain string id, no escaping. 'kb-ru-pole21-rf' not "
        "'\"kb-ru-pole21-rf\"'.\n"
        "  - No KB match → actor='Unknown', confidence < 0.50, note in evidence: "
        "'No KB match; assessment based on signal pattern only.'\n\n"

        "## REALISTIC EXAMPLE\n"
        "GOOD — RF + PNT cluster, confidence 0.68:\n"
        "  actor='Russia / GRU'\n"
        "  confidence=0.68\n"
        "  evidence[0]='Link-segment interference on UAS C2 frequencies is consistent "
        "with Pole-21 wideband jamming signature (kb-ru-pole21-rf).'\n"
        "  evidence[1]='GNSS position divergence on DRONE-03 affecting terrestrial-segment "
        "PNT trust is consistent with co-located spoofing, a known Pole-21 deployment "
        "pattern.'\n"
        "  evidence[2]='Alternative explanations have not been ruled out. "
        "kb-attribution-uncertainty-001 applies.'\n"
        "  predicted_next='Doctrine suggests ground EW may precede co-orbital action "
        "in the opening phase, per kb-ru-pole21-rf.'\n"
        "  kb_citations=['kb-ru-pole21-rf', 'kb-attribution-uncertainty-001']\n\n"
        "BAD — do not produce any of these:\n"
        "  kb_citations=[]  ← INVALID. Always include uncertainty anchor.\n"
        "  actor='Russia', kb_citations=['kb-attribution-uncertainty-001']  "
        "← INVALID. Named actor needs KB support beyond the anchor.\n"
        "  evidence='Confirmed coordinated Russian RF interference.'  "
        "← INVALID. 'Confirmed' is prohibited.\n"
        "  evidence='Credible coordinated threat pattern detected.'  "
        "← INVALID. Prohibited phrase.\n\n"

        "Submit your assessment via the submit_attribution tool."
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
        "## Anomaly Cluster\n"
        "The following anomalies have been correlated by the fusion engine. "
        "Assess which are attributable, which are ambiguous, and which lack "
        "sufficient evidence for actor attribution.\n\n"
        f"```json\n{anomalies_blob}\n```\n\n"

        "## Knowledge Base\n"
        "These KB entries are the doctrinal threat concepts available to ground "
        "your assessment. Cite only entries that match observable signal patterns. "
        "If no entry matches, say so explicitly in evidence.\n\n"
        f"```json\n{kb_blob}\n```\n\n"

        "## Pre-Submission Checklist — Verify All Before Calling Tool\n"
        "[ ] kb_citations contains 'kb-attribution-uncertainty-001'\n"
        "[ ] If actor is not 'Unknown', at least one KB entry beyond the "
        "uncertainty anchor is cited\n"
        "[ ] No prohibited phrases in any field "
        "('confirmed', 'proves', 'credible coordinated threat pattern', etc.)\n"
        "[ ] Final evidence item states the uncertainty caveat\n"
        "[ ] Confidence score matches the tier vocabulary\n"
        "[ ] Each evidence item names the affected segment (orbital/link/terrestrial)\n\n"
        "Submit the attribution assessment via the submit_attribution tool."
    )

# ---- Red-team challenge prompt ------------------------------------------

REDTEAM_TOOL: dict[str, Any] = {
    "name": "submit_challenge",
    "description": (
        "Critique the primary attribution. Identify the strongest alternative "
        "actor or hypothesis the primary may have missed, list specific "
        "objections to the primary's reasoning, and propose a confidence "
        "delta (negative if primary is overconfident, positive only when red-team "
        "agrees evidence is stronger than primary scored). The reconciler will "
        "use this to produce the final calibrated attribution."
    ),
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["objections", "confidence_delta", "rationale"],
        "properties": {
            "alternative_actor": {
                "type": ["string", "null"],
                "description": (
                    "Best alternative actor if one is plausible. Null if the "
                    "primary's actor is the strongest hypothesis but the "
                    "confidence is too high."
                ),
            },
            "objections": {
                "type": "array",
                "items": {"type": "string"},
                "description": "One short objection per item (1-3 items).",
            },
            "confidence_delta": {
                "type": "number",
                "minimum": -0.4,
                "maximum": 0.1,
                "description": (
                    "Adjustment to apply to primary.confidence. Negative is "
                    "typical (primary is usually overconfident). Use 0 to "
                    "endorse the primary's confidence as calibrated."
                ),
            },
            "rationale": {
                "type": "string",
                "description": "One- or two-sentence rationale for the challenge.",
            },
        },
    },
}


def redteam_system_prompt() -> str:
    return (
        "You are CANOPY's red-team attribution agent. Your job is to challenge "
        "the primary attribution: surface plausible alternative actors, name the "
        "weakest links in the primary's evidence chain, and propose a "
        "confidence delta. Default to skepticism — single-domain cues should "
        "rarely support >0.7 attribution. Submit via submit_challenge."
    )


def redteam_user_prompt(
    primary: "Attribution",
    anomalies: list[Anomaly],
    kb_entries: Iterable[KBEntry],
) -> str:
    primary_blob = json.dumps(primary.model_dump(mode="json"), indent=2, default=str)
    anomalies_blob = json.dumps(
        [a.model_dump(mode="json") for a in anomalies], indent=2, default=str
    )
    kb_blob = json.dumps(
        [e.model_dump(mode="json") for e in kb_entries], indent=2, default=str
    )
    return (
        "## Primary Attribution\n"
        f"```json\n{primary_blob}\n```\n\n"
        "## Anomalies\n"
        f"```json\n{anomalies_blob}\n```\n\n"
        "## Knowledge Base\n"
        f"```json\n{kb_blob}\n```\n\n"
        "Identify alternative actors, objections, and a calibrated confidence "
        "delta. Submit via the submit_challenge tool."
    )


# ---- Reconciler prompt --------------------------------------------------


def reconcile_system_prompt() -> str:
    return (
        "You are CANOPY's reconciler agent. Given a primary attribution and "
        "a red-team challenge, produce the final calibrated attribution. "
        "Apply the red-team's confidence delta unless the challenge is "
        "weak. If the challenge raises a more credible alternative actor and "
        "the evidence supports it, change the actor. Otherwise keep the "
        "primary's actor and lower the confidence. Always include the "
        "uncertainty anchor (kb-attribution-uncertainty-001) and append a "
        "summary of the red-team objection to the evidence chain. "
        "Submit via submit_attribution — same schema as the primary."
    )


def reconcile_user_prompt(
    primary: "Attribution",
    challenge: "AttributionChallenge",
    anomalies: list[Anomaly],
    kb_entries: Iterable[KBEntry],
) -> str:
    primary_blob = json.dumps(primary.model_dump(mode="json"), indent=2, default=str)
    challenge_blob = json.dumps(
        challenge.model_dump(mode="json"), indent=2, default=str
    )
    anomalies_blob = json.dumps(
        [a.model_dump(mode="json") for a in anomalies], indent=2, default=str
    )
    kb_blob = json.dumps(
        [e.model_dump(mode="json") for e in kb_entries], indent=2, default=str
    )
    return (
        "## Primary Attribution\n"
        f"```json\n{primary_blob}\n```\n\n"
        "## Red-Team Challenge\n"
        f"```json\n{challenge_blob}\n```\n\n"
        "## Anomalies\n"
        f"```json\n{anomalies_blob}\n```\n\n"
        "## Knowledge Base\n"
        f"```json\n{kb_blob}\n```\n\n"
        "Produce the final calibrated attribution. Submit via "
        "submit_attribution."
    )
