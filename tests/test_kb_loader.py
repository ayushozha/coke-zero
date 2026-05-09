from __future__ import annotations

import json
from pathlib import Path

import pytest

from coke_zero.services.kb import KB
from coke_zero.services.kb.loader import load_kb_json
from coke_zero.services.kb.models import KBEntry

KB_FILE = Path(__file__).resolve().parent.parent / "data" / "kb_seed_entries.json"


def test_load_canonical_kb_file() -> None:
    entries = load_kb_json(KB_FILE)
    assert all(isinstance(e, KBEntry) for e in entries)
    assert len(entries) >= 5


def test_no_duplicate_ids() -> None:
    entries = load_kb_json(KB_FILE)
    ids = [e.id for e in entries]
    assert len(ids) == len(set(ids))


def test_facade_indexes_by_scenario_signal_id() -> None:
    kb = KB.load_from_json(KB_FILE)
    russia = kb.by_scenario_signal_id("coke-zero-beat2-001")
    assert russia, "expected at least one KB entry for beat2-001"
    assert russia[0].actor == "Russia"

    rpo = kb.by_scenario_signal_id("coke-zero-beat47-002")
    assert rpo, "expected at least one KB entry for beat47-002"
    assert rpo[0].capability_type == "co_orbital_rpo"


def test_facade_by_capability_and_actor() -> None:
    kb = KB.load_from_json(KB_FILE)
    assert kb.by_capability("jamming_spoofing")
    assert kb.by_capability("co_orbital_rpo")
    assert kb.by_actor("Russia")
    assert kb.by_actor("China")


def test_facade_get_and_membership() -> None:
    kb = KB.load_from_json(KB_FILE)
    assert "kb-attribution-uncertainty-001" in kb
    entry = kb.get("kb-attribution-uncertainty-001")
    assert entry is not None
    assert entry.capability_type == "attribution_uncertainty"
    assert kb.get("does_not_exist") is None


def test_loader_rejects_duplicate_ids(tmp_path: Path) -> None:
    file = tmp_path / "kb.json"
    file.write_text(
        json.dumps(
            {
                "entries": [
                    {
                        "id": "dup",
                        "title": "A",
                        "actor": "X",
                        "domain": [],
                        "capability_type": "x",
                        "summary": "x",
                    },
                    {
                        "id": "dup",
                        "title": "B",
                        "actor": "X",
                        "domain": [],
                        "capability_type": "x",
                        "summary": "x",
                    },
                ]
            }
        )
    )
    with pytest.raises(ValueError, match="duplicate KB entry id"):
        load_kb_json(file)


def test_loader_accepts_bare_list(tmp_path: Path) -> None:
    file = tmp_path / "kb.json"
    file.write_text(
        json.dumps(
            [
                {
                    "id": "x",
                    "title": "X",
                    "actor": "Y",
                    "domain": [],
                    "capability_type": "x",
                    "summary": "x",
                }
            ]
        )
    )
    assert len(load_kb_json(file)) == 1
