from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from coke_zero.services.bus import Bus
from coke_zero.services.ids import base_signal_id
from coke_zero.services.schemas.events import (
    Attribution,
    Decision,
    OperatorAction,
    OperatorActionStatus,
    ReasoningTrace,
    Signal,
    UIEvent,
)
from coke_zero.services.traces import Tracer

log = logging.getLogger(__name__)

__all__ = [
    "DEFAULT_MEMORY_PATH",
    "MissionMemoryService",
    "MissionMemoryState",
    "MissionMemoryStore",
    "decision_memory_signature",
    "operator_action_memory_signature",
    "resolve_memory_path",
    "ui_event_memory_signature",
]

DEFAULT_MEMORY_PATH = Path("data/mission_memory.json")
MEMORY_SCHEMA_VERSION = 1
MAX_COLLECTION_SIZE = 200

DigestKind = Literal["attribution", "decision"]


def _now() -> datetime:
    return datetime.now(UTC)


def _norm(value: object | None) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().lower().split())


def _base_ids(source_signal_ids: list[str]) -> list[str]:
    return sorted(base_signal_id(str(signal_id)) for signal_id in source_signal_ids)


def _source_key(source_id: str, fallback: str) -> str:
    if source_id.startswith("mission-watch:"):
        parts = source_id.split(":", 2)
        if len(parts) == 3 and parts[2]:
            return parts[2]
    return source_id or fallback


def _signature(kind: str, parts: list[object | None]) -> str:
    return "|".join([kind, *(_norm(part) for part in parts)])


def ui_event_memory_signature(event: UIEvent) -> str:
    recommendation_summary = (
        event.recommendation.summary if event.recommendation is not None else ""
    )
    return _signature(
        "ui_event",
        [
            event.type,
            event.title,
            recommendation_summary,
            ",".join(_base_ids(event.source_signal_ids)),
        ],
    )


def decision_memory_signature(decision: Decision) -> str:
    return _signature(
        "decision",
        [
            decision.action,
            decision.target,
            ",".join(_base_ids(decision.source_signal_ids)),
        ],
    )


def operator_action_memory_signature(action: OperatorAction) -> str:
    if action.subject_signature:
        return action.subject_signature
    if action.subject_kind == "decision" or action.action or action.target:
        return _signature(
            "decision",
            [
                action.action,
                action.target,
                ",".join(_base_ids(action.source_signal_ids)),
            ],
        )
    return _signature(
        "ui_event",
        [
            action.event_type or "recommendation_created",
            action.title,
            action.summary,
            ",".join(_base_ids(action.source_signal_ids)),
        ],
    )


def resolve_memory_path(path: str | Path | None = None) -> Path:
    if path is not None:
        return Path(path)
    env_path = os.environ.get("COKE_ZERO_MEMORY_PATH")
    return Path(env_path) if env_path else DEFAULT_MEMORY_PATH


class AlertMemory(BaseModel):
    id: str
    signature: str
    type: str
    title: str
    severity: str
    confidence: float
    source_signal_ids: list[str] = Field(default_factory=list)
    recommendation_id: str | None = None
    first_seen_at: datetime = Field(default_factory=_now)
    last_seen_at: datetime = Field(default_factory=_now)
    seen_count: int = 1


class RecommendationMemory(BaseModel):
    id: str
    signature: str
    summary: str
    decision_id: str | None = None
    ui_event_id: str | None = None
    action: str | None = None
    target: str | None = None
    authority: str | None = None
    status: OperatorActionStatus | None = None
    first_seen_at: datetime = Field(default_factory=_now)
    last_seen_at: datetime = Field(default_factory=_now)
    seen_count: int = 1


class OperatorActionMemory(BaseModel):
    id: str
    status: OperatorActionStatus
    subject_kind: str = "unknown"
    subject_signature: str
    actor: str = "operator"
    event_id: str | None = None
    event_type: str | None = None
    recommendation_id: str | None = None
    decision_id: str | None = None
    title: str | None = None
    summary: str | None = None
    action: str | None = None
    target: str | None = None
    source_signal_ids: list[str] = Field(default_factory=list)
    note: str | None = None
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class WatchWindowSummary(BaseModel):
    run_id: str
    scenarios: list[str] = Field(default_factory=list)
    status: Literal["running", "ok", "error"] = "running"
    signals_published: int = 0
    started_at: datetime = Field(default_factory=_now)
    completed_at: datetime | None = None
    last_message: str = ""
    error: str | None = None
    trace_count: int = 0


class ContextDigest(BaseModel):
    key: str
    kind: DigestKind
    summary: str
    source_signal_ids: list[str] = Field(default_factory=list)
    payload: dict[str, object] = Field(default_factory=dict)
    first_seen_at: datetime = Field(default_factory=_now)
    last_seen_at: datetime = Field(default_factory=_now)
    seen_count: int = 1


class SourceTimestamp(BaseModel):
    source_id: str
    signal_count: int = 0
    first_signal_at: datetime | None = None
    last_signal_at: datetime | None = None
    last_generated_at: datetime | None = None
    last_signal_id: str | None = None


class RiskBaseline(BaseModel):
    key: str
    domain: str
    event_type: str
    base_signal_id: str
    summary: str
    source_ids: list[str] = Field(default_factory=list)
    first_seen_at: datetime = Field(default_factory=_now)
    last_seen_at: datetime = Field(default_factory=_now)
    seen_count: int = 1
    max_confidence: float = 0.0


class MissionMemoryState(BaseModel):
    schema_version: int = MEMORY_SCHEMA_VERSION
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
    prior_alerts: dict[str, AlertMemory] = Field(default_factory=dict)
    recommendations: dict[str, RecommendationMemory] = Field(default_factory=dict)
    operator_actions: dict[str, OperatorActionMemory] = Field(default_factory=dict)
    watch_windows: dict[str, WatchWindowSummary] = Field(default_factory=dict)
    context_digests: dict[str, ContextDigest] = Field(default_factory=dict)
    source_timestamps: dict[str, SourceTimestamp] = Field(default_factory=dict)
    risk_baselines: dict[str, RiskBaseline] = Field(default_factory=dict)


class MissionMemoryStore:
    def __init__(
        self,
        path: str | Path | None = None,
        *,
        state: MissionMemoryState | None = None,
        warning: str | None = None,
    ) -> None:
        self.path = resolve_memory_path(path)
        self.state = state or MissionMemoryState()
        self.warning = warning

    @classmethod
    def load(cls, path: str | Path | None = None) -> "MissionMemoryStore":
        resolved = resolve_memory_path(path)
        if not resolved.exists():
            store = cls(resolved)
            store.save()
            log.info("mission memory initialized at %s", resolved)
            return store
        try:
            raw = json.loads(resolved.read_text(encoding="utf-8"))
            state = MissionMemoryState.model_validate(raw)
            return cls(resolved, state=state)
        except (OSError, json.JSONDecodeError, ValidationError) as exc:
            warning = (
                f"mission memory at {resolved} was missing required structure "
                "or invalid JSON; recreated safe defaults"
            )
            log.warning("%s: %s", warning, exc)
            store = cls(resolved, warning=warning)
            store.save()
            return store

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.state.updated_at = _now()
        payload = json.dumps(
            self.state.model_dump(mode="json"),
            indent=2,
            sort_keys=True,
        )
        tmp = self.path.with_name(f"{self.path.name}.tmp")
        tmp.write_text(payload + "\n", encoding="utf-8")
        tmp.replace(self.path)

    def reset(self) -> None:
        self.state = MissionMemoryState()
        self.warning = None
        self.save()

    def snapshot(self) -> dict[str, object]:
        return {
            "path": str(self.path),
            "warning": self.warning,
            "counts": self.summary(),
            "state": self.state.model_dump(mode="json"),
        }

    def summary(self) -> dict[str, int]:
        return {
            "prior_alerts": len(self.state.prior_alerts),
            "recommendations": len(self.state.recommendations),
            "operator_actions": len(self.state.operator_actions),
            "watch_windows": len(self.state.watch_windows),
            "context_digests": len(self.state.context_digests),
            "source_timestamps": len(self.state.source_timestamps),
            "risk_baselines": len(self.state.risk_baselines),
        }

    def record_signal(self, signal: Signal) -> tuple[RiskBaseline | None, bool]:
        source_id = _source_key(signal.provenance.source_id, signal.source)
        source = self.state.source_timestamps.get(source_id)
        if source is None:
            source = SourceTimestamp(source_id=source_id)
        source.signal_count += 1
        if source.first_signal_at is None:
            source.first_signal_at = signal.ts
        source.last_signal_at = signal.ts
        source.last_generated_at = signal.provenance.generated_at
        source.last_signal_id = signal.id
        self.state.source_timestamps[source_id] = source

        event_type = signal.payload.event_type
        baseline_key = _signature(
            "signal",
            [signal.domain, event_type, base_signal_id(signal.id)],
        )
        had_baseline = baseline_key in self.state.risk_baselines
        baseline = self.state.risk_baselines.get(baseline_key)
        if baseline is None:
            baseline = RiskBaseline(
                key=baseline_key,
                domain=signal.domain,
                event_type=event_type,
                base_signal_id=base_signal_id(signal.id),
                summary=signal.payload.summary,
                source_ids=[source_id],
                first_seen_at=signal.ts,
                last_seen_at=signal.ts,
                max_confidence=signal.confidence,
            )
        else:
            baseline.seen_count += 1
            baseline.last_seen_at = signal.ts
            baseline.summary = signal.payload.summary
            baseline.max_confidence = max(baseline.max_confidence, signal.confidence)
            if source_id not in baseline.source_ids:
                baseline.source_ids.append(source_id)
        self.state.risk_baselines[baseline_key] = baseline
        self._trim(self.state.risk_baselines)
        return baseline, had_baseline

    def record_ui_event(self, event: UIEvent) -> tuple[AlertMemory, OperatorActionMemory | None]:
        signature = ui_event_memory_signature(event)
        prior_action = self.state.operator_actions.get(signature)
        alert = self.state.prior_alerts.get(signature)
        recommendation_id = event.recommendation.id if event.recommendation else None
        if alert is None:
            alert = AlertMemory(
                id=event.id,
                signature=signature,
                type=event.type,
                title=event.title,
                severity=event.severity,
                confidence=event.confidence,
                source_signal_ids=_base_ids(event.source_signal_ids),
                recommendation_id=recommendation_id,
                first_seen_at=event.timestamp,
                last_seen_at=event.timestamp,
            )
        else:
            alert.id = event.id
            alert.severity = event.severity
            alert.confidence = event.confidence
            alert.source_signal_ids = _base_ids(event.source_signal_ids)
            alert.recommendation_id = recommendation_id
            alert.last_seen_at = event.timestamp
            alert.seen_count += 1
        self.state.prior_alerts[signature] = alert
        self._trim(self.state.prior_alerts)

        if event.recommendation is not None:
            recommendation = self.state.recommendations.get(signature)
            if recommendation is None:
                recommendation = RecommendationMemory(
                    id=event.recommendation.id,
                    signature=signature,
                    summary=event.recommendation.summary,
                    ui_event_id=event.id,
                    status=prior_action.status if prior_action else None,
                    first_seen_at=event.timestamp,
                    last_seen_at=event.timestamp,
                )
            else:
                recommendation.id = event.recommendation.id
                recommendation.summary = event.recommendation.summary
                recommendation.ui_event_id = event.id
                recommendation.last_seen_at = event.timestamp
                recommendation.seen_count += 1
                if prior_action is not None:
                    recommendation.status = prior_action.status
            self.state.recommendations[signature] = recommendation
            self._trim(self.state.recommendations)

        return alert, prior_action

    def record_attribution(self, attribution: Attribution) -> tuple[ContextDigest, bool]:
        source_ids = _base_ids(attribution.source_signal_ids)
        fallback = ",".join(sorted(attribution.anomaly_ids))
        key = _signature(
            "attribution",
            [attribution.actor, ",".join(source_ids) or fallback],
        )
        summary = (
            f"{attribution.actor} confidence={attribution.confidence:.2f}; "
            f"next={attribution.predicted_next or 'n/a'}"
        )
        return self._record_context_digest(
            key=key,
            kind="attribution",
            summary=summary,
            source_signal_ids=source_ids,
            payload={
                "actor": attribution.actor,
                "confidence": attribution.confidence,
                "kb_citations": list(attribution.kb_citations),
            },
        )

    def record_decision(self, decision: Decision) -> tuple[ContextDigest, OperatorActionMemory | None]:
        signature = decision_memory_signature(decision)
        prior_action = self.state.operator_actions.get(signature)
        source_ids = _base_ids(decision.source_signal_ids)
        digest, _ = self._record_context_digest(
            key=signature,
            kind="decision",
            summary=(
                f"{decision.action} authority={decision.authority} "
                f"target={decision.target}"
            ),
            source_signal_ids=source_ids,
            payload={
                "decision_id": decision.id,
                "action": decision.action,
                "authority": decision.authority,
                "target": decision.target,
            },
        )
        if decision.authority == "request":
            recommendation = self.state.recommendations.get(signature)
            if recommendation is None:
                recommendation = RecommendationMemory(
                    id=f"decision:{decision.id}",
                    signature=signature,
                    summary=decision.rationale,
                    decision_id=decision.id,
                    action=decision.action,
                    target=decision.target,
                    authority=decision.authority,
                    status=prior_action.status if prior_action else None,
                    first_seen_at=decision.ts,
                    last_seen_at=decision.ts,
                )
            else:
                recommendation.decision_id = decision.id
                recommendation.summary = decision.rationale
                recommendation.action = decision.action
                recommendation.target = decision.target
                recommendation.authority = decision.authority
                recommendation.last_seen_at = decision.ts
                recommendation.seen_count += 1
                if prior_action is not None:
                    recommendation.status = prior_action.status
            self.state.recommendations[signature] = recommendation
            self._trim(self.state.recommendations)
        return digest, prior_action

    def record_operator_action(self, action: OperatorAction) -> OperatorActionMemory:
        signature = operator_action_memory_signature(action)
        existing = self.state.operator_actions.get(signature)
        created_at = existing.created_at if existing else action.ts
        record = OperatorActionMemory(
            id=action.id,
            status=action.status,
            subject_kind=action.subject_kind or "unknown",
            subject_signature=signature,
            actor=action.actor,
            event_id=action.event_id,
            event_type=action.event_type,
            recommendation_id=action.recommendation_id,
            decision_id=action.decision_id,
            title=action.title,
            summary=action.summary,
            action=action.action,
            target=action.target,
            source_signal_ids=_base_ids(action.source_signal_ids),
            note=action.note,
            created_at=created_at,
            updated_at=action.ts,
        )
        self.state.operator_actions[signature] = record
        self._trim(self.state.operator_actions)

        recommendation = self.state.recommendations.get(signature)
        if recommendation is not None:
            recommendation.status = action.status
            recommendation.last_seen_at = action.ts
            if action.decision_id:
                recommendation.decision_id = action.decision_id
            if action.recommendation_id:
                recommendation.id = action.recommendation_id
            self.state.recommendations[signature] = recommendation

        return record

    def record_watch_trace(
        self, trace: ReasoningTrace
    ) -> tuple[WatchWindowSummary | None, list[WatchWindowSummary]]:
        run_id = trace.payload.get("run_id")
        if not isinstance(run_id, str) or not run_id:
            return None, []
        scenarios_raw = trace.payload.get("scenarios")
        scenarios = (
            [str(item) for item in scenarios_raw]
            if isinstance(scenarios_raw, list)
            else []
        )
        scenario_set = set(scenarios)
        prior = [
            window
            for window in self.state.watch_windows.values()
            if window.run_id != run_id
            and window.status == "ok"
            and scenario_set
            and scenario_set.issubset(set(window.scenarios))
        ]

        window = self.state.watch_windows.get(run_id)
        if window is None:
            window = WatchWindowSummary(
                run_id=run_id,
                scenarios=scenarios,
                started_at=trace.ts,
                last_message=trace.message,
            )
        if scenarios:
            window.scenarios = scenarios
        window.trace_count += 1
        window.last_message = trace.message
        published = trace.payload.get("signals_published")
        if isinstance(published, int):
            window.signals_published = published
            window.status = "error" if trace.level == "warn" else "ok"
            window.completed_at = trace.ts
        error = trace.payload.get("error")
        if isinstance(error, str) and error:
            window.error = error
            window.status = "error"
            window.completed_at = trace.ts
        self.state.watch_windows[run_id] = window
        self._trim(self.state.watch_windows)
        return window, prior

    def _record_context_digest(
        self,
        *,
        key: str,
        kind: DigestKind,
        summary: str,
        source_signal_ids: list[str],
        payload: dict[str, object],
    ) -> tuple[ContextDigest, bool]:
        existed = key in self.state.context_digests
        digest = self.state.context_digests.get(key)
        if digest is None:
            digest = ContextDigest(
                key=key,
                kind=kind,
                summary=summary,
                source_signal_ids=source_signal_ids,
                payload=payload,
            )
        else:
            digest.summary = summary
            digest.source_signal_ids = source_signal_ids
            digest.payload = payload
            digest.last_seen_at = _now()
            digest.seen_count += 1
        self.state.context_digests[key] = digest
        self._trim(self.state.context_digests)
        return digest, existed

    @staticmethod
    def _trim(collection: dict[str, object]) -> None:
        while len(collection) > MAX_COLLECTION_SIZE:
            oldest_key = next(iter(collection))
            collection.pop(oldest_key, None)


class MissionMemoryService:
    def __init__(
        self,
        bus: Bus,
        store: MissionMemoryStore,
        *,
        tracer: Tracer | None = None,
    ) -> None:
        self._bus = bus
        self._store = store
        self._tracer = tracer
        self._lock = asyncio.Lock()
        self._signal_hit_keys: set[str] = set()

    @property
    def store(self) -> MissionMemoryStore:
        return self._store

    async def run(self) -> None:
        await self._emit_startup_trace()
        async with asyncio.TaskGroup() as tg:
            tg.create_task(self._consume_signals(), name="memory-signals")
            tg.create_task(self._consume_attributions(), name="memory-attributions")
            tg.create_task(self._consume_decisions(), name="memory-decisions")
            tg.create_task(self._consume_ui_events(), name="memory-ui-events")
            tg.create_task(self._consume_operator_actions(), name="memory-actions")
            tg.create_task(self._consume_watch_traces(), name="memory-watch")

    async def record_operator_action_event(
        self, action: OperatorAction
    ) -> OperatorActionMemory:
        async with self._lock:
            record = self._store.record_operator_action(action)
            self._store.save()
        await self._emit_memory_trace(
            "decision",
            (
                f"operator {record.status} persisted for "
                f"{record.subject_kind} memory"
            ),
            ref_id=record.decision_id or record.event_id or record.id,
            status=record.status,
            subject_signature=record.subject_signature,
        )
        return record

    async def reset(self) -> None:
        async with self._lock:
            self._store.reset()
            self._signal_hit_keys.clear()
        await self._emit_memory_trace(
            "warn",
            "mission memory reset for demo rehearsal",
            ref_id=None,
            path=str(self._store.path),
        )

    async def _consume_signals(self) -> None:
        async for _, event in self._bus.subscribe("signals.*"):
            if not isinstance(event, Signal):
                continue
            async with self._lock:
                baseline, had_baseline = self._store.record_signal(event)
                self._store.save()
            if had_baseline and baseline is not None:
                hit_key = baseline.key
                if hit_key not in self._signal_hit_keys:
                    self._signal_hit_keys.add(hit_key)
                    await self._emit_memory_trace(
                        "info",
                        (
                            "memory hit: baseline for "
                            f"{baseline.domain}/{baseline.event_type} "
                            f"seen {baseline.seen_count - 1} prior time(s)"
                        ),
                        ref_id=event.id,
                        baseline_key=baseline.key,
                        source_signal_id=baseline.base_signal_id,
                    )

    async def _consume_attributions(self) -> None:
        async for _, event in self._bus.subscribe("attributions.*"):
            if not isinstance(event, Attribution):
                continue
            async with self._lock:
                digest, existed = self._store.record_attribution(event)
                self._store.save()
            if existed:
                await self._emit_memory_trace(
                    "info",
                    f"memory hit: attribution context reused ({digest.summary})",
                    ref_id=event.id,
                    digest_key=digest.key,
                )

    async def _consume_decisions(self) -> None:
        async for _, event in self._bus.subscribe("decisions.*"):
            if not isinstance(event, Decision):
                continue
            async with self._lock:
                digest, prior_action = self._store.record_decision(event)
                self._store.save()
            if prior_action is not None:
                await self._emit_memory_trace(
                    "decision",
                    (
                        f"memory hit: prior {prior_action.status} decision "
                        f"for {event.action} on {event.target}"
                    ),
                    ref_id=event.id,
                    digest_key=digest.key,
                    status=prior_action.status,
                )

    async def _consume_ui_events(self) -> None:
        async for _, event in self._bus.subscribe("ui_events.*"):
            if not isinstance(event, UIEvent):
                continue
            async with self._lock:
                alert, prior_action = self._store.record_ui_event(event)
                self._store.save()
            if alert.seen_count > 1:
                await self._emit_memory_trace(
                    "info",
                    (
                        f"memory hit: prior alert '{event.title}' "
                        f"seen {alert.seen_count - 1} time(s)"
                    ),
                    ref_id=event.id,
                    alert_signature=alert.signature,
                )
            if prior_action is not None:
                await self._emit_memory_trace(
                    "decision",
                    (
                        f"memory hit: recommendation was previously "
                        f"{prior_action.status}"
                    ),
                    ref_id=event.id,
                    alert_signature=alert.signature,
                    status=prior_action.status,
                )

    async def _consume_operator_actions(self) -> None:
        async for _, event in self._bus.subscribe("operator_actions.*"):
            if not isinstance(event, OperatorAction):
                continue
            await self.record_operator_action_event(event)

    async def _consume_watch_traces(self) -> None:
        async for _, event in self._bus.subscribe("traces.watch"):
            if not isinstance(event, ReasoningTrace):
                continue
            async with self._lock:
                window, prior = self._store.record_watch_trace(event)
                self._store.save()
            if window is not None and prior and window.trace_count == 1:
                last = max(prior, key=lambda item: item.completed_at or item.started_at)
                await self._emit_memory_trace(
                    "info",
                    (
                        "memory hit: prior watch window "
                        f"{last.run_id} covered {', '.join(last.scenarios)}"
                    ),
                    ref_id=window.run_id,
                    prior_run_id=last.run_id,
                    scenarios=window.scenarios,
                )

    async def _emit_startup_trace(self) -> None:
        counts = self._store.summary()
        if self._store.warning:
            await self._emit_memory_trace(
                "warn",
                self._store.warning,
                path=str(self._store.path),
                counts=counts,
            )
            return
        await self._emit_memory_trace(
            "info",
            (
                "mission memory loaded: "
                f"{counts['prior_alerts']} alerts, "
                f"{counts['operator_actions']} operator actions, "
                f"{counts['watch_windows']} watch windows"
            ),
            path=str(self._store.path),
            counts=counts,
        )

    async def _emit_memory_trace(
        self,
        level: Literal["info", "decision", "tool", "warn"],
        message: str,
        ref_id: str | None = None,
        **payload: object,
    ) -> None:
        if self._tracer is None:
            return
        await self._tracer.emit(
            "memory",
            level,
            message,
            ref_id=ref_id,
            **payload,
        )
