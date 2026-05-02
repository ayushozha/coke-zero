from __future__ import annotations

import json
import logging
import sqlite3
from pathlib import Path

import yaml

from halo.services.kb.models import KBEntry

log = logging.getLogger(__name__)


SCHEMA = """
CREATE TABLE IF NOT EXISTS kb_entries (
    id TEXT PRIMARY KEY,
    actor TEXT NOT NULL,
    unit TEXT,
    system TEXT NOT NULL,
    domain TEXT NOT NULL,
    signature_json TEXT NOT NULL,
    doctrine TEXT NOT NULL,
    sources_json TEXT NOT NULL,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_kb_actor ON kb_entries(actor);
CREATE INDEX IF NOT EXISTS idx_kb_domain ON kb_entries(domain);
CREATE INDEX IF NOT EXISTS idx_kb_system ON kb_entries(system);
"""


def init_db(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


def load_yaml_dir(entries_dir: Path) -> list[KBEntry]:
    """Walk entries_dir for *.yaml files and validate each as a KBEntry."""
    entries: list[KBEntry] = []
    seen_ids: set[str] = set()
    for path in sorted(entries_dir.rglob("*.yaml")):
        with path.open() as f:
            raw = yaml.safe_load(f)
        if raw is None:
            log.warning("skipping empty KB file: %s", path)
            continue
        entry = KBEntry.model_validate(raw)
        if entry.id in seen_ids:
            raise ValueError(f"duplicate KB entry id: {entry.id} in {path}")
        seen_ids.add(entry.id)
        entries.append(entry)
    return entries


def upsert(conn: sqlite3.Connection, entries: list[KBEntry]) -> None:
    rows = [
        (
            e.id,
            e.actor,
            e.unit,
            e.system,
            e.domain,
            json.dumps(e.signature, sort_keys=True),
            e.doctrine,
            json.dumps(e.sources),
            e.notes,
        )
        for e in entries
    ]
    conn.executemany(
        """
        INSERT INTO kb_entries
            (id, actor, unit, system, domain, signature_json, doctrine, sources_json, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            actor=excluded.actor,
            unit=excluded.unit,
            system=excluded.system,
            domain=excluded.domain,
            signature_json=excluded.signature_json,
            doctrine=excluded.doctrine,
            sources_json=excluded.sources_json,
            notes=excluded.notes
        """,
        rows,
    )
    conn.commit()
