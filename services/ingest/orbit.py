"""Orbit adapter for propagated or synthetic orbital events."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from .common import Signal, iter_domain_signals


DOMAIN = "orbit"
PRODUCTION_REPLACEMENT = "Same adapter shape with live TLE/OMM refresh and precision propagation."


def iter_signals(path: str | Path) -> Iterator[Signal]:
    """Yield orbit signals from JSONL demo feeds."""
    yield from iter_domain_signals(path, DOMAIN)

