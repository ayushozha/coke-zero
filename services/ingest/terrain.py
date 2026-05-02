"""Terrain adapter for cached public AOR map context."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from .common import Signal, iter_domain_signals


DOMAIN = "terrain"
PRODUCTION_REPLACEMENT = "Cached OSM/Mapbox terrain tiles or production geospatial services."


def iter_signals(path: str | Path) -> Iterator[Signal]:
    """Yield terrain signals from JSONL demo feeds."""
    yield from iter_domain_signals(path, DOMAIN)
