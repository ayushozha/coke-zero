from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path

from canopy.services.bus import InProcessBus
from canopy.services.fusion import FusionService
from canopy.services.schemas.events import (
    Anomaly,
    Location,
    Provenance,
    Signal,
)


def _signal(
    *,
    domain: str,
    event_type: str,
    summary: str = "test",
    confidence: float = 0.8,
    ts: datetime | None = None,
    observables: dict | None = None,
) -> Signal:
    return Signal(
        ts=ts or datetime.now(UTC),
        domain=domain,
        source="test",
        realism="mock_operational",
        confidence=confidence,
        location=Location(label="t"),
        payload={
            "event_type": event_type,
            "summary": summary,
            "observables": observables or {},
        },
        provenance=Provenance(source_id="t"),
    )


async def _collect_anomalies(bus: InProcessBus, n: int, timeout: float = 1.0) -> list[Anomaly]:
    received: list[Anomaly] = []

    async def sub() -> None:
        async for _, event in bus.subscribe("anomalies.*"):
            if isinstance(event, Anomaly):
                received.append(event)
                if len(received) >= n:
                    return

    try:
        await asyncio.wait_for(sub(), timeout=timeout)
    except TimeoutError:
        pass
    return received


async def test_rf_signal_emits_rf_anomaly() -> None:
    bus = InProcessBus()
    fusion = FusionService(bus)
    fusion_task = asyncio.create_task(fusion.run())
    await asyncio.sleep(0.05)

    await bus.publish(
        "signals.rf_ew",
        _signal(domain="rf_ew", event_type="rf_interference", confidence=0.86),
    )

    anomalies = await _collect_anomalies(bus, n=1)
    fusion_task.cancel()
    await asyncio.gather(fusion_task, return_exceptions=True)
    bus.close()

    assert len(anomalies) >= 1
    assert anomalies[0].kind == "rf_anomaly"
    assert anomalies[0].severity > 0


async def test_rpo_close_approach_emits_orbital_rpo_risk() -> None:
    bus = InProcessBus()
    fusion = FusionService(bus)
    fusion_task = asyncio.create_task(fusion.run())
    await asyncio.sleep(0.05)

    await bus.publish(
        "signals.orbit",
        _signal(
            domain="orbit",
            event_type="rpo_close_approach",
            confidence=0.78,
            observables={"miss_distance_km": 8.6, "target": "CANOPY-LEO-07"},
        ),
    )

    anomalies = await _collect_anomalies(bus, n=1)
    fusion_task.cancel()
    await asyncio.gather(fusion_task, return_exceptions=True)
    bus.close()

    rpo = [a for a in anomalies if a.kind == "orbital_rpo_risk"]
    assert rpo, f"expected orbital_rpo_risk anomaly, got {[a.kind for a in anomalies]}"
    # close-approach inside 10 km lifts the base severity to >= 0.82
    assert rpo[0].severity >= 0.82


async def test_rf_inside_collection_window_emits_correlated_orbital_anomaly() -> None:
    bus = InProcessBus()
    fusion = FusionService(bus)
    fusion_task = asyncio.create_task(fusion.run())
    await asyncio.sleep(0.05)

    t0 = datetime.now(UTC)
    # 1) Collection window opens.
    await bus.publish(
        "signals.orbit",
        _signal(
            domain="orbit",
            event_type="collection_window_start",
            confidence=0.7,
            ts=t0,
            observables={"satellite": "SAT-A", "risk": 0.6},
        ),
    )
    # 2) RF anomaly arrives 30 seconds later — should fire orbital_collection_correlated.
    await bus.publish(
        "signals.rf_ew",
        _signal(
            domain="rf_ew",
            event_type="rf_interference",
            confidence=0.85,
            ts=t0 + timedelta(seconds=30),
        ),
    )

    anomalies = await _collect_anomalies(bus, n=4, timeout=0.5)
    fusion_task.cancel()
    await asyncio.gather(fusion_task, return_exceptions=True)
    bus.close()

    kinds = {a.kind for a in anomalies}
    assert "orbital_collection_risk" in kinds
    assert "rf_anomaly" in kinds
    assert "orbital_collection_correlated" in kinds
    # The correlated emission should pick up the RF boost.
    correlated = next(a for a in anomalies if a.kind == "orbital_collection_correlated")
    assert correlated.severity >= 0.7


async def test_overlapping_collection_windows_emit_overlap() -> None:
    bus = InProcessBus()
    fusion = FusionService(bus)
    fusion_task = asyncio.create_task(fusion.run())
    await asyncio.sleep(0.05)

    t0 = datetime.now(UTC)
    await bus.publish(
        "signals.orbit",
        _signal(
            domain="orbit",
            event_type="collection_window_start",
            confidence=0.6,
            ts=t0,
            observables={"satellite": "SAT-A", "risk": 0.6},
        ),
    )
    await bus.publish(
        "signals.orbit",
        _signal(
            domain="orbit",
            event_type="collection_window_start",
            confidence=0.6,
            ts=t0 + timedelta(seconds=10),
            observables={"satellite": "SAT-B", "risk": 0.55},
        ),
    )

    anomalies = await _collect_anomalies(bus, n=2, timeout=0.5)
    fusion_task.cancel()
    await asyncio.gather(fusion_task, return_exceptions=True)
    bus.close()

    kinds = {a.kind for a in anomalies}
    assert "orbital_collection_risk" in kinds
    assert "orbital_collection_overlap" in kinds
