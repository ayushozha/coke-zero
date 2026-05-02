"""OSINT and threat-intel adapter."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from .common import Signal, iter_domain_signals


DOMAIN = "osint"
PRODUCTION_REPLACEMENT = "Curated open-source and classified all-source intelligence feeds."


def iter_signals(path: str | Path) -> Iterator[Signal]:
    """Yield OSINT signals from JSONL demo feeds."""
    yield from iter_domain_signals(path, DOMAIN)

