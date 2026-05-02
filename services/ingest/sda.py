"""SDA adapter for cached public orbital catalog records."""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

from .common import Signal, build_signal, iter_domain_signals


DOMAIN = "sda"
PRODUCTION_REPLACEMENT = "USSPACECOM Space-Track API or commercial SDA providers"


def iter_signals(path: str | Path) -> Iterator[Signal]:
    """Yield SDA signals from JSONL demo feeds."""
    yield from iter_domain_signals(path, DOMAIN)


def from_celestrak_json(path: str | Path, *, ts: str) -> Iterator[Signal]:
    """Convert a cached CelesTrak JSON array into coarse SDA catalog signals."""
    records = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(records, list):
        raise ValueError("expected CelesTrak JSON array")

    for index, item in enumerate(records):
        name = item.get("OBJECT_NAME") or item.get("OBJECT_ID") or f"object-{index}"
        norad_id = item.get("NORAD_CAT_ID")
        yield build_signal(
            signal_id=f"sig_sda_celestrak_{norad_id or index}",
            ts=ts,
            domain=DOMAIN,
            source="celestrak-gp-cache",
            realism="real_source",
            confidence=0.9,
            payload={
                "event_type": "catalog_object",
                "asset": str(name),
                "summary": f"Cached public orbital element record for {name}.",
                "observables": item,
            },
            provenance={
                "source_id": "celestrak-gp",
                "citation": "https://celestrak.org/NORAD/elements/gp.php",
                "notes": "Cached public CelesTrak GP record.",
            },
        )

