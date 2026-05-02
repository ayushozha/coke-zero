from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from halo.services.kb.loader import init_db, load_yaml_dir, upsert
from halo.services.kb.models import KBEntry

__all__ = ["KB", "KBEntry"]


class KB:
    """Read-side facade over the SQLite-backed knowledge base."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    @classmethod
    def load_from_yaml(cls, entries_dir: str | Path, db_path: str | Path) -> "KB":
        entries = load_yaml_dir(Path(entries_dir))
        conn = init_db(Path(db_path))
        upsert(conn, entries)
        return cls(conn)

    def get(self, entry_id: str) -> KBEntry | None:
        row = self._conn.execute(
            "SELECT * FROM kb_entries WHERE id = ?", (entry_id,)
        ).fetchone()
        return _row_to_entry(row) if row else None

    def by_actor(self, actor: str) -> list[KBEntry]:
        rows = self._conn.execute(
            "SELECT * FROM kb_entries WHERE actor = ? ORDER BY id", (actor,)
        ).fetchall()
        return [_row_to_entry(r) for r in rows]

    def by_domain(self, domain: str) -> list[KBEntry]:
        rows = self._conn.execute(
            "SELECT * FROM kb_entries WHERE domain = ? ORDER BY id", (domain,)
        ).fetchall()
        return [_row_to_entry(r) for r in rows]

    def all_entries(self) -> list[KBEntry]:
        rows = self._conn.execute(
            "SELECT * FROM kb_entries ORDER BY id"
        ).fetchall()
        return [_row_to_entry(r) for r in rows]

    def __len__(self) -> int:
        row = self._conn.execute("SELECT COUNT(*) AS n FROM kb_entries").fetchone()
        return int(row["n"])


def _row_to_entry(row: sqlite3.Row) -> KBEntry:
    return KBEntry(
        id=row["id"],
        actor=row["actor"],
        unit=row["unit"],
        system=row["system"],
        domain=row["domain"],
        signature=json.loads(row["signature_json"]),
        doctrine=row["doctrine"],
        sources=json.loads(row["sources_json"]),
        notes=row["notes"],
    )
