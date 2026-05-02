"""Drone and edge-sensor adapter."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from .common import Signal, iter_domain_signals


DOMAIN = "drone"
PRODUCTION_REPLACEMENT = "Real UAS telemetry via STANAG 4586, MQTT, or vendor SDKs."


def iter_signals(path: str | Path) -> Iterator[Signal]:
    """Yield drone/edge-sensor signals from JSONL demo feeds."""
    yield from iter_domain_signals(path, DOMAIN)

