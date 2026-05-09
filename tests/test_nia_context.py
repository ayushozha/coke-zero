from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

from coke_zero.services.attrib import AttribService
from coke_zero.services.bus import InProcessBus
from coke_zero.services.decide import DecideService
from coke_zero.services.decide.tools import KBLookupTool, ToolContext, dispatch
from coke_zero.services.kb import KB
from coke_zero.services.nia_context import (
    NiaCliContextProvider,
    NiaContextHit,
    NiaContextResult,
)
from coke_zero.services.llm.stub import StubLLMClient
from coke_zero.services.orbit import OrbitService
from coke_zero.services.schemas.events import Anomaly, Attribution, ReasoningTrace
from coke_zero.services.traces import Tracer

ROOT = Path(__file__).resolve().parent.parent
KB_FILE = ROOT / "data" / "kb_seed_entries.json"


class FakeNiaContext:
    async def retrieve(self, query: str, *, limit: int = 3) -> NiaContextResult:
        return NiaContextResult(
            query=query,
            available=True,
            hits=(
                NiaContextHit(
                    label="docs/data_sources.md",
                    citation="docs/data_sources.md:12",
                    snippet="docs/data_sources.md:12 source registry context",
                ),
            ),
            source_labels=("docs/data_sources.md",),
            raw_preview="docs/data_sources.md:12 source registry context",
        )


class EmptyNiaContext:
    async def retrieve(self, query: str, *, limit: int = 3) -> NiaContextResult:
        return NiaContextResult(
            query=query,
            available=True,
            hits=(),
            source_labels=(),
            raw_preview="Using nia.json scope: 1 local folder\ncontent:\nsources:\n  (empty)",
        )


def _anomaly() -> Anomaly:
    return Anomaly(
        kind="orbital_rpo_risk",
        source_signal="sig-1",
        source_signal_ids=["sig-1"],
        severity=0.8,
        payload={"summary": "RPO close approach near protected satellite"},
    )


def _attribution() -> Attribution:
    return Attribution(
        anomaly_ids=["anom-1"],
        actor="China",
        confidence=0.71,
        doctrine_match="kb-rpo-ambiguity-001",
        evidence=["Close approach consistent with documented RPO precedent."],
        kb_citations=["kb-rpo-ambiguity-001"],
        source_signal_ids=["sig-1"],
    )


@pytest.mark.asyncio
async def test_nia_cli_provider_extracts_source_labels(tmp_path: Path) -> None:
    (tmp_path / "nia.json").write_text('{"name":"test","sources":[]}\n')
    script = tmp_path / "fake_nia.py"
    script.write_text(
        "import sys\n"
        "print('Using nia.json scope: 1 local folder', file=sys.stderr)\n"
        "print('README.md:22 architecture context')\n"
        "print('docs/data_sources.md:7 source registry')\n"
        "print('source: file_path: data/source_registry.json')\n"
    )
    provider = NiaCliContextProvider(
        project_root=tmp_path,
        command=[sys.executable, str(script)],
        timeout_s=1.0,
    )

    result = await provider.retrieve("test query")

    assert result.available is True
    assert result.count == 3
    assert "README.md" in result.source_labels
    assert "data/source_registry.json" in result.source_labels
    assert result.hits[0].citation == "README.md:22"


@pytest.mark.asyncio
async def test_nia_cli_provider_soft_fails_when_cli_missing(tmp_path: Path) -> None:
    (tmp_path / "nia.json").write_text('{"name":"test","sources":[]}\n')
    provider = NiaCliContextProvider(
        project_root=tmp_path,
        command="definitely-not-a-nia-command",
        timeout_s=1.0,
    )

    result = await provider.retrieve("test query")

    assert result.available is False
    assert "CLI not found" in (result.error or "")


@pytest.mark.asyncio
async def test_nia_cli_provider_uses_manifest_local_fallback_on_cli_error(
    tmp_path: Path,
) -> None:
    (tmp_path / "nia.json").write_text(
        '{"name":"test","sources":[],"local":[{"id":"local-test","path":"."}]}\n'
    )
    (tmp_path / "data").mkdir()
    (tmp_path / "README.md").write_text(
        "# coke-zero\n\nNia context grounding covers attribution and decision traces.\n"
    )
    (tmp_path / "data" / "kb_seed_entries.json").write_text(
        '{"title":"Attribution uncertainty","summary":"Preserve evidence chains."}\n'
    )
    script = tmp_path / "fake_nia.py"
    script.write_text(
        "import sys\n"
        "print('Authentication failed — query quota exceeded', file=sys.stderr)\n"
        "raise SystemExit(1)\n"
    )
    provider = NiaCliContextProvider(
        project_root=tmp_path,
        command=[sys.executable, str(script)],
        timeout_s=1.0,
    )

    result = await provider.retrieve("coke-zero Nia attribution decision grounding")

    assert result.available is True
    assert result.mode == "nia.json.local"
    assert result.error is not None
    assert result.count >= 1
    assert "README.md" in result.source_labels


@pytest.mark.asyncio
async def test_attribution_emits_nia_context_trace() -> None:
    kb = KB.load_from_json(KB_FILE)
    bus = InProcessBus()
    tracer = Tracer(bus)
    attrib = AttribService(
        bus,
        StubLLMClient(kb),
        kb,
        window_s=0.0,
        tracer=tracer,
        nia_context=FakeNiaContext(),
    )

    traces: list[ReasoningTrace] = []

    async def consume() -> None:
        async for _, event in bus.subscribe("traces.attrib_primary"):
            assert isinstance(event, ReasoningTrace)
            traces.append(event)
            if "nia.context" in event.message:
                break

    consumer = asyncio.create_task(consume())
    runner = asyncio.create_task(attrib.run())
    await asyncio.sleep(0)

    await bus.publish("anomalies.orbital_rpo_risk", _anomaly())
    await asyncio.wait_for(consumer, timeout=2.0)

    runner.cancel()
    try:
        await runner
    except asyncio.CancelledError:
        pass

    trace = next(t for t in traces if "nia.context" in t.message)
    assert trace.payload["provider"] == "nia"
    assert trace.payload["source_labels"] == ["docs/data_sources.md"]


@pytest.mark.asyncio
async def test_decision_emits_nia_context_trace() -> None:
    kb = KB.load_from_json(KB_FILE)
    bus = InProcessBus()
    tracer = Tracer(bus)
    tool_ctx = ToolContext(
        kb=kb,
        orbit=None,
        tracer=tracer,
        nia_context=FakeNiaContext(),
    )
    decide = DecideService(
        bus,
        StubLLMClient(kb),
        tracer=tracer,
        tools=[],
        tool_ctx=tool_ctx,
    )

    traces: list[ReasoningTrace] = []

    async def consume() -> None:
        async for _, event in bus.subscribe("traces.decide"):
            assert isinstance(event, ReasoningTrace)
            traces.append(event)
            if "nia.context" in event.message:
                break

    consumer = asyncio.create_task(consume())
    runner = asyncio.create_task(decide.run())
    for _ in range(20):
        if len(bus._subs) >= 3:  # trace consumer + decide anomaly/attribution subs
            break
        await asyncio.sleep(0.01)

    await bus.publish("attributions.china", _attribution())
    await asyncio.wait_for(consumer, timeout=2.0)

    runner.cancel()
    try:
        await runner
    except asyncio.CancelledError:
        pass

    trace = next(t for t in traces if "nia.context" in t.message)
    assert trace.payload["provider"] == "nia"
    assert trace.payload["source_labels"] == ["docs/data_sources.md"]


@pytest.mark.asyncio
async def test_attribution_emits_nia_zero_hit_fallback_trace() -> None:
    kb = KB.load_from_json(KB_FILE)
    bus = InProcessBus()
    tracer = Tracer(bus)
    attrib = AttribService(
        bus,
        StubLLMClient(kb),
        kb,
        window_s=0.0,
        tracer=tracer,
        nia_context=EmptyNiaContext(),
    )

    traces: list[ReasoningTrace] = []

    async def consume() -> None:
        async for _, event in bus.subscribe("traces.attrib_primary"):
            assert isinstance(event, ReasoningTrace)
            traces.append(event)
            if "0 indexed source hit" in event.message:
                break

    consumer = asyncio.create_task(consume())
    runner = asyncio.create_task(attrib.run())
    await asyncio.sleep(0)

    await bus.publish("anomalies.orbital_rpo_risk", _anomaly())
    await asyncio.wait_for(consumer, timeout=2.0)

    runner.cancel()
    try:
        await runner
    except asyncio.CancelledError:
        pass

    trace = next(t for t in traces if "0 indexed source hit" in t.message)
    assert trace.level == "warn"
    assert trace.payload["provider"] == "nia"
    assert trace.payload["available"] is True
    assert trace.payload["count"] == 0


@pytest.mark.asyncio
async def test_kb_lookup_trace_includes_nia_hits() -> None:
    bus = InProcessBus()
    tracer = Tracer(bus)
    ctx = ToolContext(
        kb=KB.load_from_json(KB_FILE),
        orbit=OrbitService(),
        tracer=tracer,
        nia_context=FakeNiaContext(),
    )
    traces: list[ReasoningTrace] = []

    async def consume() -> None:
        async for _, event in bus.subscribe("traces.tools"):
            assert isinstance(event, ReasoningTrace)
            traces.append(event)
            break

    consumer = asyncio.create_task(consume())
    await asyncio.sleep(0)

    await dispatch(KBLookupTool(), {"actor": "China"}, ctx, ref_id="dec-test")
    await asyncio.wait_for(consumer, timeout=1.0)

    assert "Nia hits" in traces[0].message
    assert traces[0].payload["result"]["nia_context"]["source_labels"] == [
        "docs/data_sources.md"
    ]
