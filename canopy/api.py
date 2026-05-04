from __future__ import annotations

import asyncio
import logging
import os
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from pydantic import BaseModel
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from canopy.services.attrib import AttribService
from canopy.services.bus import InProcessBus
from canopy.services.decide import DecideService
from canopy.services.fusion import FusionService
from canopy.services.kb import KB
from canopy.services.llm.stub import StubLLMClient
from canopy.services.schemas.events import Signal, UIEvent
from canopy.services.ui_events import UIEventService

log = logging.getLogger(__name__)

DEFAULT_KB_PATH = Path("data/kb_seed_entries.json")


class CanopyRuntime:
    def __init__(self) -> None:
        self.bus = InProcessBus()
        self.signal_history: deque[tuple[str, Signal]] = deque(maxlen=50)
        self.ui_event_history: deque[tuple[str, UIEvent]] = deque(maxlen=20)
        self._tasks: list[asyncio.Task] = []

    async def start(self) -> None:
        if self._tasks:
            return

        kb = KB.load_from_json(DEFAULT_KB_PATH)
        llm = StubLLMClient(kb)
        attrib_window_s = float(os.environ.get("CANOPY_ATTRIB_WINDOW_S", "0.5"))

        services = [
            ("fusion", FusionService(self.bus).run()),
            ("attrib", AttribService(self.bus, llm, kb, window_s=attrib_window_s).run()),
            ("decide", DecideService(self.bus, llm).run()),
            ("ui_events", UIEventService(self.bus).run()),
            ("bridge_cache", self._record_ui_events()),
        ]
        self._tasks = [
            asyncio.create_task(coro, name=f"canopy-api-{name}")
            for name, coro in services
        ]
        log.info("CANOPY API runtime started with %d services", len(self._tasks))

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()
        self.bus.close()
        log.info("CANOPY API runtime stopped")

    async def _record_ui_events(self) -> None:
        async for topic, event in self.bus.subscribe("ui_events.*"):
            if isinstance(event, UIEvent):
                self.ui_event_history.append((topic, event))


runtime = CanopyRuntime()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(
        level=os.environ.get("CANOPY_LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    await runtime.start()
    try:
        yield
    finally:
        await runtime.stop()


app = FastAPI(title="CANOPY API Bridge", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "service": "canopy-api-bridge"}


@app.post("/signals")
async def ingest_signal(payload: dict[str, Any]) -> dict[str, Any]:
    signal = Signal.model_validate(payload)
    topic = f"signals.{signal.domain}"
    runtime.signal_history.append((topic, signal))
    await runtime.bus.publish(topic, signal)
    return {"ok": True, "id": signal.id, "domain": signal.domain}


async def send_bridge_message(
    socket: WebSocket, *, message_type: str, topic: str, event: BaseModel
) -> None:
    await socket.send_json(
        {
            "type": message_type,
            "topic": topic,
            "data": event.model_dump(mode="json", by_alias=True),
        }
    )


@app.websocket("/ws/brigade")
async def brigade_socket(socket: WebSocket) -> None:
    await socket.accept()

    try:
        for topic, event in runtime.signal_history:
            await send_bridge_message(
                socket, message_type="signal", topic=topic, event=event
            )
        for topic, event in runtime.ui_event_history:
            await send_bridge_message(
                socket, message_type="ui_event", topic=topic, event=event
            )

        async for topic, event in runtime.bus.subscribe("*"):
            if topic.startswith("signals."):
                message_type = "signal"
            elif topic.startswith("ui_events."):
                message_type = "ui_event"
            else:
                continue

            await send_bridge_message(
                socket, message_type=message_type, topic=topic, event=event
            )
    except WebSocketDisconnect:
        log.info("brigade websocket disconnected")
