from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from coke_zero.services.bus import Bus
from coke_zero.services.ids import watch_signal_id
from coke_zero.services.scenario_replay import load_scenario_signals
from coke_zero.services.schemas.events import Signal
from coke_zero.services.traces import Tracer

log = logging.getLogger(__name__)

__all__ = ["MissionWatchService", "WatchCycleResult"]


@dataclass(frozen=True)
class WatchCycleResult:
    run_id: str
    status: str
    scenarios: list[str]
    signals_published: int
    started_at: datetime
    completed_at: datetime
    error: str | None = None


class MissionWatchService:
    """Autonomous scenario watcher that publishes repeatable mission cycles.

    The watcher is intentionally separate from ``ScenarioReplayService`` because
    repeatable background execution needs unique signal ids per run, explicit
    run metadata, and visible reasoning traces that identify the cycle as
    autonomous rather than operator-triggered replay.
    """

    def __init__(
        self,
        bus: Bus,
        scenarios: str | Path | Iterable[str | Path],
        *,
        interval_s: float = 300.0,
        speed: float = 20.0,
        max_delay_s: float | None = 0.5,
        cycles: int | None = None,
        tracer: Tracer | None = None,
        run_id_factory: Callable[[], str] | None = None,
    ) -> None:
        if isinstance(scenarios, (str, Path)):
            self._paths = [Path(scenarios)]
        else:
            self._paths = [Path(p) for p in scenarios]
        if not self._paths:
            raise ValueError("mission watch requires at least one scenario")
        if interval_s <= 0:
            raise ValueError("interval_s must be positive")
        if speed <= 0:
            raise ValueError("speed must be positive")
        if cycles is not None and cycles <= 0:
            raise ValueError("cycles must be positive when provided")

        self._bus = bus
        self._interval_s = interval_s
        self._speed = speed
        self._max_delay_s = max_delay_s
        self._cycles = cycles
        self._tracer = tracer
        self._run_id_factory = run_id_factory or _default_run_id
        self.cycle_count = 0
        self.last_result: WatchCycleResult | None = None

    @property
    def scenario_paths(self) -> list[Path]:
        return list(self._paths)

    @property
    def interval_s(self) -> float:
        return self._interval_s

    @property
    def speed(self) -> float:
        return self._speed

    @property
    def max_delay_s(self) -> float | None:
        return self._max_delay_s

    async def run(self) -> None:
        completed = 0
        while self._cycles is None or completed < self._cycles:
            await self.run_cycle()
            completed += 1
            if self._cycles is not None and completed >= self._cycles:
                break
            await asyncio.sleep(self._interval_s)

    async def run_cycle(self) -> WatchCycleResult:
        run_id = self._run_id_factory()
        started_at = datetime.now(UTC)
        scenario_names = [p.name for p in self._paths]
        published = 0

        try:
            # Validate every input before publishing any mission state. A bad
            # scenario therefore produces only a watch trace, not a partial
            # signal/anomaly/decision chain in the UI.
            scenario_batches = [
                (path, load_scenario_signals(path)) for path in self._paths
            ]

            await self._emit_trace(
                "info",
                (
                    f"autonomous mission watch cycle {run_id} starting: "
                    f"{', '.join(scenario_names)}"
                ),
                run_id=run_id,
                scenarios=scenario_names,
            )

            sequence = 0
            for path, signals in scenario_batches:
                await self._emit_trace(
                    "info",
                    (
                        f"watch {run_id} loaded {path.name} "
                        f"({len(signals)} signals)"
                    ),
                    run_id=run_id,
                    scenario=path.name,
                    signal_count=len(signals),
                )
                scenario_count = await self._publish_scenario(
                    signals, run_id=run_id, sequence_start=sequence
                )
                sequence += scenario_count
                published += scenario_count

            result = WatchCycleResult(
                run_id=run_id,
                status="ok",
                scenarios=scenario_names,
                signals_published=published,
                started_at=started_at,
                completed_at=datetime.now(UTC),
            )
            self.cycle_count += 1
            self.last_result = result
            await self._emit_trace(
                "decision",
                (
                    f"autonomous mission watch cycle {run_id} published "
                    f"{published} signals; downstream reasoning is running"
                ),
                run_id=run_id,
                signals_published=published,
            )
            return result
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.exception("mission watch cycle failed run_id=%s", run_id)
            result = WatchCycleResult(
                run_id=run_id,
                status="error",
                scenarios=scenario_names,
                signals_published=published,
                started_at=started_at,
                completed_at=datetime.now(UTC),
                error=str(exc),
            )
            self.last_result = result
            await self._emit_trace(
                "warn",
                (
                    f"autonomous mission watch cycle {run_id} failed before "
                    f"publishing complete state: {exc}"
                ),
                run_id=run_id,
                error=str(exc),
                signals_published=published,
            )
            return result

    async def _publish_scenario(
        self, signals: list[Signal], *, run_id: str, sequence_start: int
    ) -> int:
        previous_ts = None
        for offset, signal in enumerate(signals, start=1):
            if previous_ts is not None:
                delay = (signal.ts - previous_ts).total_seconds() / self._speed
                if self._max_delay_s is not None:
                    delay = min(delay, self._max_delay_s)
                if delay > 0:
                    await asyncio.sleep(delay)

            tagged = _tag_signal(
                signal,
                run_id=run_id,
                sequence=sequence_start + offset,
            )
            await self._bus.publish(f"signals.{tagged.domain}", tagged)
            previous_ts = signal.ts
        return len(signals)

    async def _emit_trace(self, level: str, message: str, **payload: object) -> None:
        if self._tracer is None:
            return
        await self._tracer.emit(
            "watch",
            level,  # type: ignore[arg-type]
            message,
            ref_id=str(payload.get("run_id")) if payload.get("run_id") else None,
            autonomous=True,
            **payload,
        )


def _tag_signal(signal: Signal, *, run_id: str, sequence: int) -> Signal:
    observables = dict(signal.payload.observables or {})
    observables["mission_watch"] = {
        "autonomous": True,
        "run_id": run_id,
        "sequence": sequence,
        "original_signal_id": signal.id,
    }
    payload = signal.payload.model_copy(update={"observables": observables})

    notes = signal.provenance.notes or ""
    watch_note = f"autonomous mission watch run_id={run_id}"
    provenance = signal.provenance.model_copy(
        update={
            "source_id": f"mission-watch:{run_id}:{signal.provenance.source_id}",
            "notes": f"{notes} {watch_note}".strip(),
        }
    )

    return signal.model_copy(
        update={
            "id": watch_signal_id(signal.id, run_id),
            "source": f"mission_watch:{signal.source}",
            "payload": payload,
            "provenance": provenance,
        }
    )


def _default_run_id() -> str:
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    return f"{stamp}-{uuid4().hex[:8]}"
