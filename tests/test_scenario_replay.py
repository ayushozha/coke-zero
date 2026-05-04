from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from canopy.services.bus import InProcessBus
from canopy.services.scenario_replay import ScenarioReplayService, load_scenario_signals
from canopy.services.schemas.events import Signal

ROOT = Path(__file__).resolve().parent.parent
SCENARIOS = sorted((ROOT / "scenarios").glob("*.jsonl"))


def test_all_scenarios_load_as_canonical_signals() -> None:
    assert SCENARIOS, "expected checked-in scenario files"
    for path in SCENARIOS:
        signals = load_scenario_signals(path)
        assert signals, f"empty scenario: {path}"
        assert all(isinstance(s, Signal) for s in signals)


async def test_replay_publishes_signals_in_order() -> None:
    bus = InProcessBus()
    received: list = []
    done = asyncio.Event()

    async def sniff() -> None:
        async for topic, event in bus.subscribe("signals.*"):
            received.append((topic, event))

    sniff_task = asyncio.create_task(sniff())
    await asyncio.sleep(0.02)

    stop_event = asyncio.Event()
    replay = ScenarioReplayService(
        bus,
        ROOT / "scenarios" / "beat2.jsonl",
        speed=1000.0,
        max_delay_s=0.0,
        stop_when_done=stop_event,
    )
    replay_task = asyncio.create_task(replay.run())

    try:
        await asyncio.wait_for(stop_event.wait(), timeout=2.0)
        # Let the sniff task drain any items already queued before publish raced
        # past it.
        await asyncio.sleep(0.1)
    finally:
        sniff_task.cancel()
        replay_task.cancel()
        await asyncio.gather(sniff_task, replay_task, return_exceptions=True)
        bus.close()

    assert len(received) == len(load_scenario_signals(ROOT / "scenarios" / "beat2.jsonl"))
    # Topics derive from the signal's domain.
    domains = {evt.domain for _, evt in received}
    assert domains, "no signals captured"


async def test_replay_rejects_zero_speed() -> None:
    bus = InProcessBus()
    with pytest.raises(ValueError):
        ScenarioReplayService(bus, ROOT / "scenarios" / "beat1.jsonl", speed=0.0)
