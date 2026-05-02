"""Cyber probe adapter for gateway and endpoint telemetry."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from .common import Signal, iter_domain_signals


DOMAIN = "cyber"
PRODUCTION_REPLACEMENT = "SIEM telemetry such as Splunk, Elastic, or CYBERCOM feeds."


def iter_signals(path: str | Path) -> Iterator[Signal]:
    """Yield cyber signals from JSONL demo feeds."""
    yield from iter_domain_signals(path, DOMAIN)

