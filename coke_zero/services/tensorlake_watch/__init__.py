from __future__ import annotations

import asyncio
import json
import logging
import os
from collections import Counter
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from dotenv import load_dotenv

from coke_zero._engine import Engine, build_engine
from coke_zero.services.mission_watch import MissionWatchService, WatchCycleResult

log = logging.getLogger(__name__)

__all__ = [
    "DEFAULT_TENSORLAKE_OUTPUT_DIR",
    "DEFAULT_TENSORLAKE_SCENARIO",
    "TensorlakeMissionWatchConfig",
    "TensorlakeMissionWatchEvidence",
    "TensorlakeSetupError",
    "run_tensorlake_mission_watch",
    "run_tensorlake_mission_watch_sync",
]

DEFAULT_TENSORLAKE_OUTPUT_DIR = Path("dist/tensorlake")
DEFAULT_TENSORLAKE_SCENARIO = Path("scenarios/army_multidomain_attack_chain.jsonl")

_CAPTURE_PATTERNS: tuple[tuple[str, str], ...] = (
    ("signals.*", "signal"),
    ("anomalies.*", "anomaly"),
    ("attributions.*", "attribution"),
    ("decisions.*", "decision"),
    ("ui_events.*", "ui_event"),
    ("traces.*", "trace"),
    ("embeddings.*", "embedding"),
)


class TensorlakeSetupError(RuntimeError):
    """Raised when the Tensorlake-backed path is requested without setup."""


@dataclass(frozen=True)
class TensorlakeMissionWatchConfig:
    """Configuration for one Tensorlake mission-watch evidence run."""

    scenarios: tuple[str | Path, ...] = (DEFAULT_TENSORLAKE_SCENARIO,)
    output_dir: str | Path = DEFAULT_TENSORLAKE_OUTPUT_DIR
    provider: str = "stub"
    scenario_speed: float = 200.0
    scenario_max_delay_s: float | None = 0.05
    drain_s: float = 4.0
    attrib_window_s: float = 0.5
    local_shim: bool = False
    include_osint_cluster: bool = False
    load_env_file: bool = True
    run_id: str | None = None

    def scenario_paths(self) -> tuple[Path, ...]:
        return tuple(Path(scenario) for scenario in self.scenarios)


@dataclass(frozen=True)
class TensorlakeMissionWatchEvidence:
    """Structured evidence emitted by the Tensorlake worker shim."""

    run_id: str
    backend: str
    status: str
    output_dir: Path
    events_path: Path
    summary_path: Path
    started_at: datetime
    completed_at: datetime
    api_key_present: bool
    scenario_paths: tuple[Path, ...]
    event_counts: Mapping[str, int]
    watch_result: WatchCycleResult | None
    error: str | None = None

    def to_json(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "backend": self.backend,
            "status": self.status,
            "started_at": _iso(self.started_at),
            "completed_at": _iso(self.completed_at),
            "duration_s": round(
                (self.completed_at - self.started_at).total_seconds(), 3
            ),
            "api_key_present": self.api_key_present,
            "api_key_value": "redacted" if self.api_key_present else None,
            "scenarios": [str(path) for path in self.scenario_paths],
            "event_counts": dict(self.event_counts),
            "watch": _watch_result_json(self.watch_result),
            "artifacts": {
                "output_dir": str(self.output_dir),
                "events_jsonl": str(self.events_path),
                "summary_json": str(self.summary_path),
            },
            "tensorlake": {
                "application_entrypoint": "coke_zero.tensorlake_app:mission_watch_job",
                "execution_model": (
                    "Tensorlake-compatible worker shim. Deploy the application "
                    "entrypoint with the Tensorlake CLI for cloud sandbox "
                    "execution, or run with local_shim=true to capture the same "
                    "mission-watch evidence without a cloud key."
                ),
            },
            "error": self.error,
        }


class _EvidenceLog:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._fp = path.open("w", encoding="utf-8")

    def write(self, record_type: str, **payload: Any) -> None:
        record = {
            "ts": _iso(datetime.now(UTC)),
            "record_type": record_type,
            **payload,
        }
        self._fp.write(json.dumps(record, ensure_ascii=True, default=str) + "\n")
        self._fp.flush()

    def close(self) -> None:
        self._fp.close()


async def run_tensorlake_mission_watch(
    config: TensorlakeMissionWatchConfig | None = None,
) -> TensorlakeMissionWatchEvidence:
    """Run one mission-watch cycle and capture Tensorlake proof artifacts.

    The function is intentionally plain Python so Tensorlake can run it inside
    an ``@function`` container, while local demos can execute the same path
    with ``local_shim=True`` when no cloud API key is available.
    """

    config = config or TensorlakeMissionWatchConfig()
    if config.load_env_file:
        load_dotenv()
    api_key_present = bool(os.environ.get("TENSORLAKE_API_KEY"))
    if not config.local_shim and not api_key_present:
        raise TensorlakeSetupError(
            "TENSORLAKE_API_KEY is required for the Tensorlake-backed worker "
            "path. Set it in the environment, or pass --local-shim to capture "
            "documented local worker-shim evidence without cloud launch."
        )

    scenario_paths = config.scenario_paths()
    run_id = config.run_id or _new_run_id()
    started_at = datetime.now(UTC)
    run_dir = Path(config.output_dir) / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    events_path = run_dir / "events.jsonl"
    summary_path = run_dir / "summary.json"
    backend = "local-worker-shim" if config.local_shim else "tensorlake-worker-shim"

    counts: Counter[str] = Counter()
    writer = _EvidenceLog(events_path)
    watch_result: WatchCycleResult | None = None
    error: str | None = None
    status = "ok"
    engine: Engine | None = None
    tasks: list[asyncio.Task] = []

    writer.write(
        "job_started",
        run_id=run_id,
        backend=backend,
        local_shim=config.local_shim,
        api_key_present=api_key_present,
        scenarios=[str(path) for path in scenario_paths],
        provider=config.provider,
        include_osint_cluster=config.include_osint_cluster,
    )

    try:
        engine = build_engine(
            provider=config.provider,
            attrib_window_s=config.attrib_window_s,
        )
        tasks.extend(_start_worker_tasks(engine, config.include_osint_cluster))
        tasks.extend(_start_capture_tasks(engine, writer, counts))
        await asyncio.sleep(0)

        watch = MissionWatchService(
            engine.bus,
            scenario_paths,
            speed=config.scenario_speed,
            max_delay_s=config.scenario_max_delay_s,
            cycles=1,
            tracer=engine.tracer,
            run_id_factory=lambda: run_id,
        )
        watch_result = await watch.run_cycle()
        writer.write(
            "watch_cycle_completed",
            run_id=run_id,
            watch=_watch_result_json(watch_result),
        )

        if config.drain_s > 0:
            await asyncio.sleep(config.drain_s)

        if watch_result.status != "ok":
            status = "error"
            error = watch_result.error
    except Exception as exc:
        status = "error"
        error = str(exc)
        writer.write("job_error", run_id=run_id, error=error)
        log.exception("Tensorlake mission-watch evidence run failed")
    finally:
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        if engine is not None:
            engine.bus.close()

    completed_at = datetime.now(UTC)
    evidence = TensorlakeMissionWatchEvidence(
        run_id=run_id,
        backend=backend,
        status=status,
        output_dir=run_dir,
        events_path=events_path,
        summary_path=summary_path,
        started_at=started_at,
        completed_at=completed_at,
        api_key_present=api_key_present,
        scenario_paths=scenario_paths,
        event_counts=dict(counts),
        watch_result=watch_result,
        error=error,
    )
    summary = evidence.to_json()
    summary_path.write_text(
        json.dumps(summary, indent=2, ensure_ascii=True), encoding="utf-8"
    )
    writer.write("job_completed", **summary)
    writer.close()
    return evidence


def run_tensorlake_mission_watch_sync(
    config: TensorlakeMissionWatchConfig | None = None,
) -> TensorlakeMissionWatchEvidence:
    return asyncio.run(run_tensorlake_mission_watch(config))


def _start_worker_tasks(engine: Engine, include_osint_cluster: bool) -> list[asyncio.Task]:
    services = [
        ("fusion", engine.fusion.run()),
        ("attrib", engine.attrib.run()),
        ("decide", engine.decide.run()),
        ("ui_events", engine.ui_events.run()),
    ]
    if include_osint_cluster:
        services.append(("osint_cluster", engine.osint_cluster.run()))
    return [asyncio.create_task(coro, name=f"tensorlake-{name}") for name, coro in services]


def _start_capture_tasks(
    engine: Engine,
    writer: _EvidenceLog,
    counts: Counter[str],
) -> list[asyncio.Task]:
    return [
        asyncio.create_task(
            _capture_events(engine, pattern, kind, writer, counts),
            name=f"tensorlake-capture-{kind}",
        )
        for pattern, kind in _CAPTURE_PATTERNS
    ]


async def _capture_events(
    engine: Engine,
    pattern: str,
    kind: str,
    writer: _EvidenceLog,
    counts: Counter[str],
) -> None:
    async for topic, event in engine.bus.subscribe(pattern):
        counts[kind] += 1
        writer.write(
            "bus_event",
            kind=kind,
            topic=topic,
            data=_event_payload(event),
        )


def _event_payload(event: Any) -> Any:
    if hasattr(event, "model_dump"):
        return event.model_dump(mode="json")
    return event


def _watch_result_json(result: WatchCycleResult | None) -> dict[str, Any] | None:
    if result is None:
        return None
    return {
        "run_id": result.run_id,
        "status": result.status,
        "scenarios": result.scenarios,
        "signals_published": result.signals_published,
        "started_at": _iso(result.started_at),
        "completed_at": _iso(result.completed_at),
        "error": result.error,
    }


def _iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _new_run_id() -> str:
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    return f"tlw-{stamp}-{uuid4().hex[:8]}"
