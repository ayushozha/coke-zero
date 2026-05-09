from __future__ import annotations

import json
from pathlib import Path

from coke_zero.services.kb.models import KBEntry


def load_kb_json(path: str | Path) -> list[KBEntry]:
    """Load knowledge-base entries from a JSON file matching kb_seed_entries.json shape.

    The file is expected to have a top-level ``entries`` array; if a bare list
    is supplied that's accepted too. Each entry validates against KBEntry.
    Duplicate ids raise ValueError.
    """
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(raw, dict):
        items = raw.get("entries", [])
    elif isinstance(raw, list):
        items = raw
    else:
        raise ValueError(f"unexpected KB JSON shape in {path}: {type(raw).__name__}")

    entries: list[KBEntry] = []
    seen: set[str] = set()
    for item in items:
        entry = KBEntry.model_validate(item)
        if entry.id in seen:
            raise ValueError(f"duplicate KB entry id: {entry.id}")
        seen.add(entry.id)
        entries.append(entry)
    return entries
