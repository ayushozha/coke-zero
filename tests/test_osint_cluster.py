"""Tests for the OSINT semantic clustering service.

Uses a deterministic mock encoder so the tests don't load the real
sentence-transformer weights. The mock returns a hand-crafted unit
vector per known phrase so we can verify clustering behavior without
network or model dependency.
"""
from __future__ import annotations

import asyncio

import numpy as np
import pytest

from halo.services.bus import InProcessBus
from halo.services.osint_cluster import OsintClusterService
from halo.services.schemas.events import (
    Anomaly,
    Location,
    OsintEmbeddingSnapshot,
    Provenance,
    ReasoningTrace,
    Signal,
)
from halo.services.traces import Tracer


class _MockEncoder:
    """Deterministic encoder that returns a fixed unit vector per phrase.

    Two phrases with overlapping tokens get vectors with high cosine
    similarity; unrelated phrases get orthogonal vectors. Lets us drive
    cluster behavior in tests without loading sentence-transformers.
    """

    def __init__(self, name: str = "mock") -> None:
        self.name = name
        self._table: dict[str, np.ndarray] = {}

    def encode(self, text: str, normalize_embeddings: bool = True) -> np.ndarray:
        # Build a 8-dim "embedding" by counting occurrences of canonical
        # tokens. Two phrases sharing tokens get similar vectors.
        tokens = ["c5isr", "rpo", "satcom", "convoy", "uas", "cyber", "rf", "iran"]
        vec = np.zeros(8, dtype=np.float32)
        lower = text.lower()
        for i, tok in enumerate(tokens):
            vec[i] = float(lower.count(tok))
        # Add a tiny per-phrase salt so empty/identical phrases still
        # land at distinct (but similar) points.
        salt = np.array(
            [hash((text, i)) % 7 for i in range(8)], dtype=np.float32
        )
        vec = vec * 4.0 + salt * 0.01
        if normalize_embeddings:
            norm = np.linalg.norm(vec) or 1.0
            vec = vec / norm
        return vec


def _signal(sig_id: str, summary: str) -> Signal:
    return Signal(
        id=sig_id,
        domain="osint",
        source="test",
        realism="mock_operational",
        confidence=0.7,
        location=Location(label="t"),
        payload={"event_type": "osint_context", "summary": summary},
        provenance=Provenance(source_id="t"),
    )


@pytest.mark.asyncio
async def test_two_similar_signals_form_a_cluster_and_emit_anomaly():
    bus = InProcessBus()
    tracer = Tracer(bus)
    svc = OsintClusterService(
        bus,
        tracer=tracer,
        encoder_factory=lambda name: _MockEncoder(name),
        similarity_threshold=0.40,
    )

    anomalies: list[Anomaly] = []
    snapshots: list[OsintEmbeddingSnapshot] = []

    async def collect_anomalies() -> None:
        async for _, event in bus.subscribe("anomalies.*"):
            if isinstance(event, Anomaly):
                anomalies.append(event)

    async def collect_snapshots() -> None:
        async for _, event in bus.subscribe("embeddings.*"):
            if isinstance(event, OsintEmbeddingSnapshot):
                snapshots.append(event)

    asyncio.create_task(collect_anomalies())
    asyncio.create_task(collect_snapshots())
    runner = asyncio.create_task(svc.run())
    await asyncio.sleep(0.05)

    await bus.publish(
        "signals.osint",
        _signal("o-1", "Coordinated counter-C5ISR pressure on division area"),
    )
    await bus.publish(
        "signals.osint",
        _signal("o-2", "C5ISR pressure detected across brigade theater"),
    )
    await asyncio.sleep(0.2)

    runner.cancel()
    try:
        await runner
    except asyncio.CancelledError:
        pass

    cluster_anomalies = [a for a in anomalies if a.kind == "osint_semantic_cluster"]
    assert len(cluster_anomalies) == 1
    cluster = cluster_anomalies[0]
    assert set(cluster.source_signal_ids) == {"o-1", "o-2"}
    assert cluster.payload["model"] == "all-MiniLM-L6-v2"  # carried even with mock
    assert cluster.payload["mean_similarity"] >= 0.40

    # Snapshot points carry both signals with the same cluster_id.
    assert snapshots
    last = snapshots[-1]
    assert len(last.points) == 2
    assert last.points[0].cluster_id == last.points[1].cluster_id


@pytest.mark.asyncio
async def test_dissimilar_signals_seed_separate_clusters():
    bus = InProcessBus()
    tracer = Tracer(bus)
    svc = OsintClusterService(
        bus,
        tracer=tracer,
        encoder_factory=lambda name: _MockEncoder(name),
        similarity_threshold=0.40,
    )

    snapshots: list[OsintEmbeddingSnapshot] = []

    async def collect() -> None:
        async for _, event in bus.subscribe("embeddings.*"):
            if isinstance(event, OsintEmbeddingSnapshot):
                snapshots.append(event)

    asyncio.create_task(collect())
    runner = asyncio.create_task(svc.run())
    await asyncio.sleep(0.05)

    await bus.publish("signals.osint", _signal("o-1", "RPO close approach detected"))
    await bus.publish("signals.osint", _signal("o-2", "Convoy resilience update"))
    await asyncio.sleep(0.2)

    runner.cancel()
    try:
        await runner
    except asyncio.CancelledError:
        pass

    assert snapshots
    last = snapshots[-1]
    cluster_ids = {p.cluster_id for p in last.points}
    assert len(cluster_ids) == 2  # different topics, different clusters


@pytest.mark.asyncio
async def test_emits_fusion_trace_when_cluster_forms():
    bus = InProcessBus()
    tracer = Tracer(bus)
    svc = OsintClusterService(
        bus,
        tracer=tracer,
        encoder_factory=lambda name: _MockEncoder(name),
        similarity_threshold=0.40,
    )

    fusion_traces: list[ReasoningTrace] = []

    async def collect() -> None:
        async for _, event in bus.subscribe("traces.fusion"):
            if isinstance(event, ReasoningTrace):
                fusion_traces.append(event)

    asyncio.create_task(collect())
    runner = asyncio.create_task(svc.run())
    await asyncio.sleep(0.05)

    await bus.publish("signals.osint", _signal("o-1", "C5ISR pressure"))
    await bus.publish("signals.osint", _signal("o-2", "Counter-C5ISR pressure"))
    await asyncio.sleep(0.2)

    runner.cancel()
    try:
        await runner
    except asyncio.CancelledError:
        pass

    cluster_traces = [
        t for t in fusion_traces if "osint cluster" in t.message.lower()
    ]
    assert len(cluster_traces) == 1
    assert "sim=" in cluster_traces[0].message


@pytest.mark.asyncio
async def test_pca_projection_yields_2d_coords():
    bus = InProcessBus()
    svc = OsintClusterService(
        bus,
        encoder_factory=lambda name: _MockEncoder(name),
        similarity_threshold=0.40,
    )

    snapshots: list[OsintEmbeddingSnapshot] = []

    async def collect() -> None:
        async for _, event in bus.subscribe("embeddings.*"):
            if isinstance(event, OsintEmbeddingSnapshot):
                snapshots.append(event)

    asyncio.create_task(collect())
    runner = asyncio.create_task(svc.run())
    await asyncio.sleep(0.05)

    summaries = [
        "C5ISR pressure",
        "Counter-C5ISR pressure on brigade",
        "RPO close approach",
        "Convoy under UAS pressure",
        "RF interference report",
    ]
    for i, s in enumerate(summaries):
        await bus.publish("signals.osint", _signal(f"o-{i}", s))
    await asyncio.sleep(0.3)

    runner.cancel()
    try:
        await runner
    except asyncio.CancelledError:
        pass

    assert snapshots
    last = snapshots[-1]
    assert len(last.points) == len(summaries)
    # Each point should have finite x/y coordinates.
    for p in last.points:
        assert -10.0 < p.x < 10.0
        assert -10.0 < p.y < 10.0
