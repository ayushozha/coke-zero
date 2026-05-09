"""Shared engine builder used by both the CLI and the FastAPI gateway.

Bundling the ``InProcessBus`` + KB + LLM + four async services into one
function keeps :mod:`coke_zero.cli` and :mod:`coke_zero.api` in lock-step. If a new
service joins the engine, it ships here once.
"""
from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from pathlib import Path

from coke_zero.services.attrib import AttribService
from coke_zero.services.bus import InProcessBus
from coke_zero.services.decide import DecideService
from coke_zero.services.decide.tools import build_tool_registry
from coke_zero.services.fusion import FusionService
from coke_zero.services.kb import KB
from coke_zero.services.llm import LLMClient
from coke_zero.services.mission_memory import MissionMemoryService, MissionMemoryStore
from coke_zero.services.nia_context import NiaCliContextProvider
from coke_zero.services.orbit import OrbitService
from coke_zero.services.osint_cluster import OsintClusterService
from coke_zero.services.traces import Tracer
from coke_zero.services.ui_events import UIEventService

DEFAULT_KB_PATH = Path("data/kb_seed_entries.json")
LLM_PROVIDERS = ("stub", "anthropic", "ollama")

log = logging.getLogger(__name__)


@dataclass
class Engine:
    bus: InProcessBus
    kb: KB
    orbit: OrbitService
    llm: LLMClient
    tracer: Tracer
    fusion: FusionService
    attrib: AttribService
    decide: DecideService
    ui_events: UIEventService
    osint_cluster: OsintClusterService
    mission_memory: MissionMemoryService
    mission_memory_store: MissionMemoryStore


def build_llm(*, provider: str, kb: KB) -> LLMClient:
    if provider == "anthropic":
        from coke_zero.services.llm.anthropic_client import (
            DEFAULT_MODEL,
            AnthropicLLMClient,
        )

        model = os.environ.get("COKE_ZERO_ANTHROPIC_MODEL") or DEFAULT_MODEL
        return AnthropicLLMClient(kb, model=model)
    if provider == "ollama":
        from coke_zero.services.llm.ollama_client import OllamaLLMClient

        return OllamaLLMClient(kb)
    from coke_zero.services.llm.stub import StubLLMClient

    return StubLLMClient(kb)


def resolve_provider(*, llm_flag: str | None, live_flag: bool = False) -> str:
    """Pick provider from --llm > COKE_ZERO_LLM env > --live/COKE_ZERO_LIVE > stub."""
    if llm_flag:
        return llm_flag
    env_value = os.environ.get("COKE_ZERO_LLM")
    if env_value:
        return env_value.lower()
    if live_flag or os.environ.get("COKE_ZERO_LIVE"):
        return "anthropic"
    return "stub"


def build_engine(
    *,
    provider: str = "stub",
    kb_path: str | Path = DEFAULT_KB_PATH,
    attrib_window_s: float = 2.0,
    blocked_domains_provider=None,
    multi_agent: bool = True,
    memory_path: str | Path | None = None,
) -> Engine:
    """Wire up the in-process bus, KB, LLM, and the four async services."""
    bus = InProcessBus()
    kb = KB.load_from_json(kb_path)
    log.info("KB loaded: %d entries from %s", len(kb), kb_path)
    llm = build_llm(provider=provider, kb=kb)

    orbit = OrbitService()
    log.info(
        "Orbit service loaded with %d cached satellites",
        len(orbit.known_satellites()),
    )

    tracer = Tracer(bus)
    mission_memory_store = MissionMemoryStore.load(memory_path)
    mission_memory = MissionMemoryService(
        bus, mission_memory_store, tracer=tracer
    )
    nia_context = NiaCliContextProvider(project_root=Path(__file__).resolve().parents[1])
    tool_ctx, tools = build_tool_registry(
        kb=kb, orbit=orbit, tracer=tracer, nia_context=nia_context
    )
    fusion = FusionService(
        bus, tracer=tracer, blocked_domains=blocked_domains_provider
    )
    attrib = AttribService(
        bus,
        llm,
        kb,
        window_s=attrib_window_s,
        tracer=tracer,
        blocked_domains=blocked_domains_provider,
        multi_agent=multi_agent,
        nia_context=nia_context,
    )
    decide = DecideService(
        bus,
        llm,
        orbit=orbit,
        tracer=tracer,
        tools=tools,
        tool_ctx=tool_ctx,
    )
    ui_events = UIEventService(bus)
    osint_cluster = OsintClusterService(bus, tracer=tracer)

    return Engine(
        bus=bus,
        kb=kb,
        orbit=orbit,
        llm=llm,
        tracer=tracer,
        fusion=fusion,
        attrib=attrib,
        decide=decide,
        ui_events=ui_events,
        osint_cluster=osint_cluster,
        mission_memory=mission_memory,
        mission_memory_store=mission_memory_store,
    )


def start_engine_tasks(engine: Engine) -> list[asyncio.Task]:
    """Launch the service runners. Returns the tasks for cancellation."""
    return [
        asyncio.create_task(engine.fusion.run(), name="fusion"),
        asyncio.create_task(engine.attrib.run(), name="attrib"),
        asyncio.create_task(engine.decide.run(), name="decide"),
        asyncio.create_task(engine.ui_events.run(), name="ui_events"),
        asyncio.create_task(engine.osint_cluster.run(), name="osint_cluster"),
        asyncio.create_task(engine.mission_memory.run(), name="mission_memory"),
    ]
