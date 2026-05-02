from __future__ import annotations

from pathlib import Path

import pytest

from halo.services.kb import KB
from halo.services.kb.loader import load_yaml_dir
from halo.services.kb.models import KBEntry

KB_DIR = Path(__file__).resolve().parent.parent / "kb" / "entries"


def test_yaml_dir_loads_all_entries() -> None:
    entries = load_yaml_dir(KB_DIR)
    assert len(entries) == 25
    assert all(isinstance(e, KBEntry) for e in entries)


def test_no_duplicate_entry_ids() -> None:
    entries = load_yaml_dir(KB_DIR)
    ids = [e.id for e in entries]
    assert len(ids) == len(set(ids))


def test_actors_cover_all_four_countries() -> None:
    entries = load_yaml_dir(KB_DIR)
    actors = {e.actor for e in entries}
    assert actors == {"Russia", "China", "Iran", "DPRK"}


def test_kb_load_from_yaml_then_query(tmp_path: Path) -> None:
    db = tmp_path / "kb.sqlite"
    kb = KB.load_from_yaml(KB_DIR, db)
    assert len(kb) == 25
    assert {e.actor for e in kb.all_entries()} == {"Russia", "China", "Iran", "DPRK"}
    russia = kb.by_actor("Russia")
    assert len(russia) == 9
    assert all(e.actor == "Russia" for e in russia)


def test_kb_load_is_idempotent(tmp_path: Path) -> None:
    db = tmp_path / "kb.sqlite"
    kb1 = KB.load_from_yaml(KB_DIR, db)
    n1 = len(kb1)
    kb2 = KB.load_from_yaml(KB_DIR, db)
    n2 = len(kb2)
    assert n1 == n2 == 25


def test_kb_get_by_id(tmp_path: Path) -> None:
    kb = KB.load_from_yaml(KB_DIR, tmp_path / "kb.sqlite")
    entry = kb.get("ru_pole21_rf")
    assert entry is not None
    assert entry.actor == "Russia"
    assert entry.system == "Pole-21"
    assert kb.get("does_not_exist") is None


def test_loader_rejects_duplicate_ids(tmp_path: Path) -> None:
    a = tmp_path / "a.yaml"
    b = tmp_path / "b.yaml"
    a.write_text(
        "id: dup\nactor: Test\nsystem: A\ndomain: cyber\ndoctrine: x\n"
    )
    b.write_text(
        "id: dup\nactor: Test\nsystem: B\ndomain: cyber\ndoctrine: x\n"
    )
    with pytest.raises(ValueError, match="duplicate KB entry id"):
        load_yaml_dir(tmp_path)


def test_loader_rejects_malformed_yaml(tmp_path: Path) -> None:
    bad = tmp_path / "bad.yaml"
    bad.write_text("id: x\nactor: Test\n# missing required fields\n")
    with pytest.raises(Exception):
        load_yaml_dir(tmp_path)
