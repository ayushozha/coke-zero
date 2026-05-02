"""RF/EW adapter for spectrum and electronic-warfare signals."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from .common import Signal, iter_domain_signals


DOMAIN = "rf_ew"
PRODUCTION_REPLACEMENT = "TLS/EW sensor feeds, Army EW MFK, or commercial RF providers."


def iter_signals(path: str | Path) -> Iterator[Signal]:
    """Yield RF/EW signals from JSONL demo feeds."""
    yield from iter_domain_signals(path, DOMAIN)

