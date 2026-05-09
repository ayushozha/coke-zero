"""FastAPI gateway exposing the in-process coke-zero engine to browser clients.

Endpoints:

* ``GET  /health``                     — liveness
* ``GET  /scenarios``                  — list checked-in scenario JSONL filenames
* ``POST /scenarios/{name}/replay``    — start a ScenarioReplayService for that beat
* ``GET  /watch``                      — mission-watch worker status
* ``POST /watch/start``                — start repeatable autonomous watch cycles
* ``POST /watch/run-once``             — execute one autonomous watch cycle
* ``POST /signals``                    — accept a Signal and publish to the bus
* ``WS   /ws``                         — fan out every bus event as a JSON envelope:
                                         ``{topic, kind, data}``

The app boots an in-process engine in its lifespan; every connected WebSocket
gets the same firehose. Brigade vs Operator filtering is the client's job.
"""
from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from coke_zero._engine import build_engine, resolve_provider, start_engine_tasks
from coke_zero.services.mission_watch import MissionWatchService, WatchCycleResult
from coke_zero.services.scenario_replay import ScenarioReplayService
from coke_zero.services.schemas.events import OperatorAction, Signal

log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]
SCENARIOS_DIR = ROOT / "scenarios"
DEFAULT_WATCH_SCENARIO = "army_multidomain_attack_chain.jsonl"

# Topic patterns we forward to clients, paired with the kind tag they get
# tagged with in the WebSocket envelope.
_FANOUT_PATTERNS: tuple[tuple[str, str], ...] = (
    ("signals.*", "signal"),
    ("anomalies.*", "anomaly"),
    ("attributions.*", "attribution"),
    ("decisions.*", "decision"),
    ("ui_events.*", "ui_event"),
    ("operator_actions.*", "operator_action"),
    ("traces.*", "trace"),
    ("embeddings.*", "embedding"),
)


@asynccontextmanager
async def _lifespan(app: FastAPI):
    load_dotenv()
    provider = resolve_provider(llm_flag=None)
    log.info("coke-zero API starting (llm=%s)", provider)

    app.state.blocked_domains: set[str] = set()
    engine = build_engine(
        provider=provider,
        blocked_domains_provider=lambda: app.state.blocked_domains,
    )
    app.state.engine = engine
    app.state.clients = set()
    app.state.replay_task = None
    app.state.watch_task = None
    app.state.watch_service = None
    app.state.engine_tasks = start_engine_tasks(engine)
    app.state.fanout_tasks = [
        asyncio.create_task(
            _fanout(engine.bus, pattern, kind, app.state.clients),
            name=f"fanout-{kind}",
        )
        for pattern, kind in _FANOUT_PATTERNS
    ]
    if _truthy(os.environ.get("COKE_ZERO_WATCH_AUTOSTART")):
        watch = _build_watch_service_from_env(engine.bus, engine.tracer)
        app.state.watch_service = watch
        app.state.watch_task = asyncio.create_task(watch.run(), name="mission-watch")
        log.info(
            "mission watch autostarted scenarios=%s interval=%.1fs",
            [p.name for p in watch.scenario_paths],
            watch.interval_s,
        )

    try:
        yield
    finally:
        log.info("coke-zero API shutting down")
        replay = app.state.replay_task
        if replay is not None and not replay.done():
            replay.cancel()
        watch_task = app.state.watch_task
        if watch_task is not None and not watch_task.done():
            watch_task.cancel()
        for task in (*app.state.fanout_tasks, *app.state.engine_tasks):
            task.cancel()
        await asyncio.gather(
            *(t for t in (watch_task,) if t is not None),
            *(t for t in app.state.fanout_tasks),
            *(t for t in app.state.engine_tasks),
            return_exceptions=True,
        )
        engine.bus.close()


async def _fanout(bus, pattern: str, kind: str, clients: set[WebSocket]) -> None:
    """Forward every bus event matching *pattern* to every connected client."""
    async for topic, event in bus.subscribe(pattern):
        if hasattr(event, "model_dump"):
            data: Any = event.model_dump(mode="json")
        else:
            data = event
        envelope = {"topic": topic, "kind": kind, "data": data}
        # Iterate over a snapshot — clients can disconnect mid-fanout.
        for ws in list(clients):
            try:
                await ws.send_json(envelope)
            except Exception:
                clients.discard(ws)


def _truthy(value: str | None) -> bool:
    return bool(value and value.lower() not in {"0", "false", "no", "off"})


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    return float(raw)


def _env_optional_float(name: str, default: float | None) -> float | None:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    if raw.lower() in {"none", "off", "false"}:
        return None
    return float(raw)


def _watch_scenarios_from_env() -> list[str]:
    raw = os.environ.get("COKE_ZERO_WATCH_SCENARIOS", DEFAULT_WATCH_SCENARIO)
    return [part.strip() for part in raw.split(",") if part.strip()]


def _watch_scenario_names(scenario: str | None) -> list[str]:
    if not scenario:
        return _watch_scenarios_from_env()
    return [part.strip() for part in scenario.split(",") if part.strip()]


def _resolve_scenario_path(name_or_path: str | Path) -> Path:
    candidate = Path(name_or_path)
    if candidate.exists() and candidate.is_file():
        return candidate
    scenario = SCENARIOS_DIR / str(name_or_path)
    if scenario.exists() and scenario.is_file():
        return scenario
    raise HTTPException(status_code=404, detail=f"scenario not found: {name_or_path}")


def _build_watch_service_from_env(bus, tracer) -> MissionWatchService:
    return MissionWatchService(
        bus,
        [_resolve_scenario_path(name) for name in _watch_scenarios_from_env()],
        interval_s=_env_float("COKE_ZERO_WATCH_INTERVAL_S", 60.0),
        speed=_env_float("COKE_ZERO_WATCH_SPEED", 200.0),
        max_delay_s=_env_optional_float("COKE_ZERO_WATCH_MAX_DELAY_S", 0.05),
        tracer=tracer,
    )


def _watch_result_json(result: WatchCycleResult | None) -> dict[str, Any] | None:
    if result is None:
        return None
    return {
        "run_id": result.run_id,
        "status": result.status,
        "scenarios": result.scenarios,
        "signals_published": result.signals_published,
        "started_at": result.started_at.isoformat().replace("+00:00", "Z"),
        "completed_at": result.completed_at.isoformat().replace("+00:00", "Z"),
        "error": result.error,
    }


def _watch_status(app: FastAPI) -> dict[str, Any]:
    watch: MissionWatchService | None = app.state.watch_service
    task: asyncio.Task | None = app.state.watch_task
    running = bool(task is not None and not task.done())
    return {
        "running": running,
        "autostart": _truthy(os.environ.get("COKE_ZERO_WATCH_AUTOSTART")),
        "cycle_count": watch.cycle_count if watch else 0,
        "scenarios": [p.name for p in watch.scenario_paths] if watch else [],
        "interval_s": watch.interval_s if watch else None,
        "speed": watch.speed if watch else None,
        "max_delay_s": watch.max_delay_s if watch else None,
        "last_result": _watch_result_json(watch.last_result if watch else None),
    }


def create_app() -> FastAPI:
    app = FastAPI(title="coke-zero Engine Gateway", lifespan=_lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health() -> dict[str, Any]:
        engine = getattr(app.state, "engine", None)
        osint = {
            "service_attached": False,
            "model_loaded": False,
            "model_name": None,
            "embedding_dim": 0,
            "window_size": 0,
            "clusters_seen": 0,
            "similarity_threshold": None,
        }
        if engine is not None:
            cluster = engine.osint_cluster
            osint["service_attached"] = True
            osint["model_loaded"] = cluster._encoder is not None
            osint["model_name"] = cluster._model_name
            osint["embedding_dim"] = cluster._encoder_dim
            osint["window_size"] = len(cluster._window)
            osint["clusters_seen"] = cluster._next_cluster_id
            osint["similarity_threshold"] = cluster._similarity_threshold
        return {
            "status": "ok",
            "llm": engine.llm.__class__.__name__ if engine else None,
            "kb_entries": len(engine.kb) if engine else 0,
            "clients": len(getattr(app.state, "clients", ())),
            "osint_cluster": osint,
        }

    @app.get("/scenarios")
    async def list_scenarios() -> list[str]:
        if not SCENARIOS_DIR.exists():
            return []
        return sorted(p.name for p in SCENARIOS_DIR.glob("*.jsonl"))

    @app.get("/kb")
    async def get_kb() -> dict[str, Any]:
        """Return the loaded knowledge base entries.

        The Operator view uses this to resolve kb-* citation ids to full
        title/summary/decision-implications cards client-side without baking
        the JSON into the frontend bundle.
        """
        engine = app.state.engine
        return {
            "entries": [e.model_dump(mode="json") for e in engine.kb.all_entries()],
        }

    @app.get("/fixture/ui_events")
    async def get_fixture_ui_events() -> dict[str, Any]:
        """Serve the canned UIEvent fixture for the frontend's offline mode."""
        import json

        path = ROOT / "data" / "expected_ui_events.json"
        if not path.exists():
            raise HTTPException(status_code=404, detail="fixture missing")
        return json.loads(path.read_text(encoding="utf-8"))

    @app.post("/scenarios/{name}/replay")
    async def replay_scenario(name: str, speed: float = 5.0) -> dict[str, Any]:
        path = SCENARIOS_DIR / name
        if not path.exists() or not path.is_file():
            raise HTTPException(status_code=404, detail=f"scenario not found: {name}")

        prev = app.state.replay_task
        if prev is not None and not prev.done():
            prev.cancel()

        replay = ScenarioReplayService(
            app.state.engine.bus,
            path,
            speed=speed,
            max_delay_s=0.5,
        )
        app.state.replay_task = asyncio.create_task(
            replay.run(), name=f"replay-{name}"
        )
        return {"status": "replaying", "scenario": name, "speed": speed}

    @app.post("/signals")
    async def post_signal(signal: Signal) -> dict[str, Any]:
        await app.state.engine.bus.publish(f"signals.{signal.domain}", signal)
        return {"status": "queued", "id": signal.id}

    _ALLOWED_DOMAINS = {
        "sda", "orbit", "osint", "humint", "rf_ew", "cyber",
        "pnt", "satcom", "drone", "terrain",
    }

    @app.get("/stress")
    async def get_stress() -> dict[str, Any]:
        return {"blocked_domains": sorted(app.state.blocked_domains)}

    @app.post("/stress")
    async def post_stress(payload: dict[str, Any]) -> dict[str, Any]:
        raw = payload.get("blocked_domains", [])
        if not isinstance(raw, list):
            raise HTTPException(
                status_code=400, detail="blocked_domains must be a list"
            )
        invalid = [d for d in raw if d not in _ALLOWED_DOMAINS]
        if invalid:
            raise HTTPException(
                status_code=400, detail=f"unknown domains: {invalid}"
            )
        app.state.blocked_domains = set(raw)
        return {"blocked_domains": sorted(app.state.blocked_domains)}

    @app.get("/watch")
    async def get_watch() -> dict[str, Any]:
        return _watch_status(app)

    @app.get("/memory")
    async def get_memory() -> dict[str, Any]:
        return app.state.engine.mission_memory_store.snapshot()

    @app.post("/memory/operator-action")
    async def post_operator_action(action: OperatorAction) -> dict[str, Any]:
        record = await app.state.engine.mission_memory.record_operator_action_event(
            action
        )
        return {
            "status": "recorded",
            "operator_status": record.status,
            "subject_signature": record.subject_signature,
        }

    @app.post("/memory/reset")
    async def reset_memory() -> dict[str, Any]:
        await app.state.engine.mission_memory.reset()
        return {
            "status": "reset",
            "memory": app.state.engine.mission_memory_store.snapshot(),
        }

    @app.post("/watch/run-once")
    async def run_watch_once(
        scenario: str | None = None,
        speed: float | None = None,
        max_delay_s: float | None = None,
    ) -> dict[str, Any]:
        try:
            watch = MissionWatchService(
                app.state.engine.bus,
                [
                    _resolve_scenario_path(name)
                    for name in _watch_scenario_names(scenario)
                ],
                speed=(
                    speed
                    if speed is not None
                    else _env_float("COKE_ZERO_WATCH_SPEED", 200.0)
                ),
                max_delay_s=(
                    max_delay_s
                    if max_delay_s is not None
                    else _env_optional_float("COKE_ZERO_WATCH_MAX_DELAY_S", 0.05)
                ),
                cycles=1,
                tracer=app.state.engine.tracer,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        result = await watch.run_cycle()
        app.state.watch_service = watch
        return {"watch": _watch_result_json(result)}

    @app.post("/watch/start")
    async def start_watch(
        scenario: str | None = None,
        interval_s: float | None = None,
        speed: float | None = None,
        max_delay_s: float | None = None,
    ) -> dict[str, Any]:
        current: asyncio.Task | None = app.state.watch_task
        if current is not None and not current.done():
            raise HTTPException(
                status_code=409, detail="mission watch already running"
            )
        try:
            watch = MissionWatchService(
                app.state.engine.bus,
                [
                    _resolve_scenario_path(name)
                    for name in _watch_scenario_names(scenario)
                ],
                interval_s=(
                    interval_s
                    if interval_s is not None
                    else _env_float("COKE_ZERO_WATCH_INTERVAL_S", 60.0)
                ),
                speed=(
                    speed
                    if speed is not None
                    else _env_float("COKE_ZERO_WATCH_SPEED", 200.0)
                ),
                max_delay_s=(
                    max_delay_s
                    if max_delay_s is not None
                    else _env_optional_float("COKE_ZERO_WATCH_MAX_DELAY_S", 0.05)
                ),
                tracer=app.state.engine.tracer,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        app.state.watch_service = watch
        app.state.watch_task = asyncio.create_task(watch.run(), name="mission-watch")
        return _watch_status(app)

    @app.post("/watch/stop")
    async def stop_watch() -> dict[str, Any]:
        task: asyncio.Task | None = app.state.watch_task
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        app.state.watch_task = None
        return _watch_status(app)

    @app.websocket("/ws")
    async def ws(websocket: WebSocket) -> None:
        await websocket.accept()
        app.state.clients.add(websocket)
        try:
            while True:
                # Block on receive_text so the connection stays open; the
                # client doesn't actually need to send anything.
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        except Exception:
            log.exception("websocket error")
        finally:
            app.state.clients.discard(websocket)

    return app


app = create_app()
