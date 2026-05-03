"""Scoring primitives for the benchmark suite.

Match attribution actor against the seed label, classify decision actions
and authority, and bucket confidence into low/med/high tiers for
calibration scoring.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

ConfidenceBand = Literal["low", "med", "high"]


def actor_head(actor: str) -> str:
    return (actor or "").split("/", 1)[0].strip().lower()


def actor_match(predicted: str, expected: str) -> bool:
    return actor_head(predicted) == actor_head(expected)


def confidence_band(confidence: float) -> ConfidenceBand:
    if confidence < 0.50:
        return "low"
    if confidence < 0.75:
        return "med"
    return "high"


def confidence_band_match(confidence: float, expected: ConfidenceBand) -> bool:
    if expected == "any":  # type: ignore[comparison-overlap]
        return True
    return confidence_band(confidence) == expected


def action_match(predicted: str, expected: str) -> bool:
    if expected in ("any", "*"):
        return predicted != ""
    return predicted == expected


def authority_match(predicted: str, expected: str) -> bool:
    if expected in ("any", "*"):
        return predicted != ""
    return predicted == expected


@dataclass
class ScenarioResult:
    file: str
    expected_actor: str
    predicted_actor: str | None
    expected_action: str
    predicted_action: str | None
    expected_authority: str
    predicted_authority: str | None
    confidence: float | None
    expected_confidence_band: ConfidenceBand
    latency_seconds: float
    actor_correct: bool
    action_correct: bool
    authority_correct: bool
    calibrated: bool


@dataclass
class Scorecard:
    results: list[ScenarioResult] = field(default_factory=list)

    def append(self, r: ScenarioResult) -> None:
        self.results.append(r)

    @property
    def total(self) -> int:
        return len(self.results)

    def correct(self, attr: str) -> int:
        return sum(1 for r in self.results if getattr(r, attr))

    def attr_accuracy(self) -> float:
        return self.correct("actor_correct") / self.total if self.total else 0.0

    def action_accuracy(self) -> float:
        return self.correct("action_correct") / self.total if self.total else 0.0

    def authority_accuracy(self) -> float:
        return self.correct("authority_correct") / self.total if self.total else 0.0

    def calibration_rate(self) -> float:
        return self.correct("calibrated") / self.total if self.total else 0.0

    def latency_p(self, p: float) -> float:
        if not self.results:
            return 0.0
        sorted_l = sorted(r.latency_seconds for r in self.results)
        idx = max(0, min(len(sorted_l) - 1, int(p * len(sorted_l))))
        return sorted_l[idx]

    def confidence_means(self) -> dict[str, float]:
        correct = [r.confidence for r in self.results if r.actor_correct and r.confidence is not None]
        wrong = [r.confidence for r in self.results if not r.actor_correct and r.confidence is not None]
        return {
            "correct_mean": sum(correct) / len(correct) if correct else 0.0,
            "incorrect_mean": sum(wrong) / len(wrong) if wrong else 0.0,
        }

    def to_dict(self) -> dict:
        return {
            "total": self.total,
            "attribution_accuracy": round(self.attr_accuracy(), 3),
            "action_accuracy": round(self.action_accuracy(), 3),
            "authority_accuracy": round(self.authority_accuracy(), 3),
            "calibration_rate": round(self.calibration_rate(), 3),
            "latency_p50": round(self.latency_p(0.5), 3),
            "latency_p95": round(self.latency_p(0.95), 3),
            "confidence_means": {
                k: round(v, 3) for k, v in self.confidence_means().items()
            },
            "results": [
                {
                    "file": r.file,
                    "expected_actor": r.expected_actor,
                    "predicted_actor": r.predicted_actor,
                    "expected_action": r.expected_action,
                    "predicted_action": r.predicted_action,
                    "expected_authority": r.expected_authority,
                    "predicted_authority": r.predicted_authority,
                    "confidence": r.confidence,
                    "expected_band": r.expected_confidence_band,
                    "latency_seconds": round(r.latency_seconds, 3),
                    "actor_correct": r.actor_correct,
                    "action_correct": r.action_correct,
                    "authority_correct": r.authority_correct,
                    "calibrated": r.calibrated,
                }
                for r in self.results
            ],
        }
