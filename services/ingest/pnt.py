"""PNT/GNSS integrity adapter."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from .common import Signal, iter_domain_signals


DOMAIN = "pnt"
PRODUCTION_REPLACEMENT = "DAGR/M-code receivers or commercial GNSS health providers."


def iter_signals(path: str | Path) -> Iterator[Signal]:
    """Yield PNT integrity signals from JSONL demo feeds."""
    yield from iter_domain_signals(path, DOMAIN)

