"""Post-processing validation and repair for live LLM outputs."""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

UNCERTAINTY_ANCHOR = "kb-attribution-uncertainty-001"

PROHIBITED_PHRASES: list[tuple[str, str]] = [
    (r"\bconfirmed\b", "use 'assessed as consistent with' instead"),
    (r"\bproves\b", "use 'is consistent with' instead"),
    (r"\bdemonstrably\b", "use hedged language instead"),
    (r"\bdefinitively\b", "use confidence-tier language instead"),
    (
        r"\bcredible coordinated threat pattern\b",
        "use 'pattern assessed as consistent with coordinated activity' instead",
    ),
    (r"\bknown hostile\b", "use 'assessed as hostile' instead"),
]

CAVEAT_ONLY_ENTRIES = {UNCERTAINTY_ANCHOR}
MULTI_ACTOR_CONFIDENCE_CAP = 0.72


@dataclass
class ValidationResult:
    repaired: dict[str, Any]
    was_modified: bool = False
    flags: list[str] = field(default_factory=list)
    downgraded_to_unknown: bool = False


def validate_and_repair_attribution(raw: dict[str, Any]) -> ValidationResult:
    result = ValidationResult(repaired=dict(raw))
    d = result.repaired

    citations = list(d.get("kb_citations") or [])
    if not citations:
        logger.warning(
            "ATTRIB_VALIDATION: kb_citations was empty; appending uncertainty anchor. "
            "actor=%s confidence=%s",
            d.get("actor"),
            d.get("confidence"),
        )
        citations = [UNCERTAINTY_ANCHOR]
        d["kb_citations"] = citations
        result.was_modified = True
        result.flags.append("kb_citations was empty; uncertainty anchor appended")
    elif UNCERTAINTY_ANCHOR not in citations:
        citations.append(UNCERTAINTY_ANCHOR)
        d["kb_citations"] = citations
        result.was_modified = True
        result.flags.append("uncertainty anchor was missing; appended to kb_citations")

    actor = d.get("actor", "Unknown")
    substantive_citations = [c for c in citations if c not in CAVEAT_ONLY_ENTRIES]

    if actor not in ("Unknown", "") and not substantive_citations:
        logger.warning(
            "ATTRIB_VALIDATION: actor=%r with no substantive KB citations; "
            "downgrading to Unknown.",
            actor,
        )
        d["actor"] = "Unknown"
        d["confidence"] = min(float(d.get("confidence", 0.5)), 0.49)
        result.was_modified = True
        result.downgraded_to_unknown = True
        result.flags.append(
            f"actor={actor!r} had no substantive KB citations; downgraded to Unknown"
        )
        actor = "Unknown"

    evidence = list(d.get("evidence") or [])
    if actor not in ("Unknown", "") and not evidence:
        logger.warning(
            "ATTRIB_VALIDATION: actor=%r with empty evidence; downgrading to Unknown.",
            actor,
        )
        d["actor"] = "Unknown"
        d["confidence"] = min(float(d.get("confidence", 0.5)), 0.49)
        d["evidence"] = [
            "No evidence chain was produced by the attribution agent. "
            "Actor attribution is not supportable without observable signal evidence. "
            "Alternative explanations have not been ruled out. "
            f"{UNCERTAINTY_ANCHOR} applies."
        ]
        result.was_modified = True
        result.downgraded_to_unknown = True
        result.flags.append(f"actor={actor!r} had empty evidence; downgraded to Unknown")

    fields_to_scan = {
        "evidence": " ".join(d.get("evidence") or []),
        "predicted_next": d.get("predicted_next") or "",
    }
    for field_name, text in fields_to_scan.items():
        for pattern, suggestion in PROHIBITED_PHRASES:
            if re.search(pattern, text, re.IGNORECASE):
                logger.warning(
                    "ATTRIB_VALIDATION: prohibited phrase matched in field %r: "
                    "pattern=%r suggestion=%r",
                    field_name,
                    pattern,
                    suggestion,
                )
                result.flags.append(
                    f"prohibited phrase in {field_name}: {pattern!r}; {suggestion}"
                )

    if d.get("actor") == "Unknown":
        confidence = float(d.get("confidence", 0.0))
        if confidence >= 0.50:
            logger.warning(
                "ATTRIB_VALIDATION: actor='Unknown' with confidence=%.2f; "
                "capping at 0.49.",
                confidence,
            )
            d["confidence"] = 0.49
            result.was_modified = True
            result.flags.append(
                f"actor=Unknown with confidence={confidence:.2f}; capped at 0.49"
            )

    if d.get("actor") == "Multi-actor":
        confidence = float(d.get("confidence", 0.0))
        if confidence > MULTI_ACTOR_CONFIDENCE_CAP:
            joint_exercise_cited = any(
                "joint" in c or "exercise" in c for c in d.get("kb_citations", [])
            )
            if not joint_exercise_cited:
                logger.warning(
                    "ATTRIB_VALIDATION: Multi-actor confidence=%.2f exceeds cap %.2f "
                    "without joint exercise KB entry; capping.",
                    confidence,
                    MULTI_ACTOR_CONFIDENCE_CAP,
                )
                d["confidence"] = MULTI_ACTOR_CONFIDENCE_CAP
                result.was_modified = True
                result.flags.append(
                    f"Multi-actor confidence={confidence:.2f} capped at "
                    f"{MULTI_ACTOR_CONFIDENCE_CAP} (no joint exercise KB entry)"
                )

    evidence_text = " ".join(d.get("evidence") or [])
    if UNCERTAINTY_ANCHOR not in evidence_text:
        current_evidence = list(d.get("evidence") or [])
        current_evidence.append(
            "Alternative explanations have not been ruled out. "
            f"{UNCERTAINTY_ANCHOR} applies."
        )
        d["evidence"] = current_evidence
        result.was_modified = True
        result.flags.append("uncertainty caveat appended to evidence")

    if result.was_modified:
        logger.info("ATTRIB_VALIDATION: output repaired. flags=%s", result.flags)

    return result


def validate_and_repair_decision(raw: dict[str, Any]) -> dict[str, Any]:
    d = dict(raw)
    authority = d.get("authority", "local")
    rationale = d.get("rationale", "")
    request_packet = d.get("request_packet")

    if authority == "local":
        if request_packet is not None:
            logger.warning(
                "DECIDE_VALIDATION: authority='local' but request_packet is populated; "
                "clearing request_packet."
            )
            d["request_packet"] = None

        if re.search(r"\bCJFSCC\b", rationale, re.IGNORECASE):
            logger.warning(
                "DECIDE_VALIDATION: authority='local' but rationale mentions CJFSCC. "
                "rationale=%r",
                rationale,
            )

    if authority == "request" and not request_packet:
        logger.warning(
            "DECIDE_VALIDATION: authority='request' but request_packet is null; "
            "inserting minimal stub. action=%r target=%r",
            d.get("action"),
            d.get("target"),
        )
        d["request_packet"] = {
            "to": "CJFSCC",
            "supporting_supported": "Brigade -> CJFSCC",
            "requested_effect": d.get("action", "unspecified"),
            "justification": rationale,
            "actor": "unspecified - attribution not forwarded",
            "confidence": None,
            "kb_citations": [],
            "reversibility": "unspecified",
            "_validation_note": (
                "request_packet was null; stub inserted by validator. "
                "Operator should review before routing."
            ),
        }

    return d
