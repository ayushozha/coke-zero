"""SATCOM link-health adapter."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from .common import Signal, iter_domain_signals


DOMAIN = "satcom"
PRODUCTION_REPLACEMENT = "DISA SATCOM C2 or commercial provider telemetry."


def iter_signals(path: str | Path) -> Iterator[Signal]:
    """Yield SATCOM signals from JSONL demo feeds."""
    yield from iter_domain_signals(path, DOMAIN)

