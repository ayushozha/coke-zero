"""HUMINT report adapter for synthetic demo injects."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from .common import Signal, iter_domain_signals


DOMAIN = "humint"
PRODUCTION_REPLACEMENT = "DCGS-A or equivalent intelligence mission system."


def iter_signals(path: str | Path) -> Iterator[Signal]:
    """Yield HUMINT signals from JSONL demo feeds."""
    yield from iter_domain_signals(path, DOMAIN)

