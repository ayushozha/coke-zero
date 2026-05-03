"""Coverage regression for fusion's pattern map.

Every ``(domain, event_type)`` value found in any checked-in scenario must be
handled — either mapped to an anomaly kind in ``DOMAIN_PATTERN_MAP``, marked
informational in ``IGNORED_EVENT_TYPES``, or, for ``domain == "orbit"``,
listed in ``ORBIT_EVENT_TYPES`` (the correlator's known event types).

This test catches drift introduced when new scenarios add event types without
wiring fusion. The previous failure mode was silent: signals would arrive on
the bus, fusion would do nothing, and the rest of the pipeline (attribution,
decision, UIEvent) would be empty for that signal.

When this test fails, the failure message tells you exactly which file
introduced the new event types and which list to update.
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path

import pytest

from halo.services.fusion import (
    DOMAIN_PATTERN_MAP,
    IGNORED_EVENT_TYPES,
    ORBIT_EVENT_TYPES,
)
from halo.services.scenario_replay import load_scenario_signals

ROOT = Path(__file__).resolve().parent.parent
SCENARIOS = sorted((ROOT / "scenarios").glob("*.jsonl"))


def _is_covered(domain: str, event_type: str) -> bool:
    if (domain, event_type) in IGNORED_EVENT_TYPES:
        return True
    if (domain, event_type) in DOMAIN_PATTERN_MAP:
        return True
    if domain == "orbit" and event_type in ORBIT_EVENT_TYPES:
        return True
    return False


def test_every_scenario_event_type_is_covered_by_fusion() -> None:
    assert SCENARIOS, "expected checked-in scenario files"

    unmapped: dict[tuple[str, str], list[str]] = defaultdict(list)
    for path in SCENARIOS:
        for signal in load_scenario_signals(path):
            key = (signal.domain, signal.payload.event_type)
            if not _is_covered(*key):
                unmapped[key].append(path.name)

    if not unmapped:
        return

    lines = ["fusion has unmapped (domain, event_type) values in scenarios/:"]
    for (domain, event_type), files in sorted(unmapped.items()):
        files_str = ", ".join(sorted(set(files)))
        lines.append(f"  {domain}/{event_type}  → {files_str}")
    lines.append("")
    lines.append("Fix by ONE of:")
    lines.append(
        "  - Add (domain, event_type) → anomaly_kind to DOMAIN_PATTERN_MAP "
        "in halo/services/fusion/__init__.py, and add a matching attribution "
        "template to _KIND_TO_ATTRIBUTION in halo/services/llm/stub.py."
    )
    lines.append(
        "  - Add (domain, event_type) to IGNORED_EVENT_TYPES if it is a "
        "baseline / informational signal that should not raise an anomaly."
    )
    lines.append(
        "  - Add the orbit event type to ORBIT_EVENT_TYPES (and wire dispatch "
        "in FusionService._dispatch) if it is orbit-domain."
    )
    pytest.fail("\n".join(lines))


def test_pattern_map_kinds_have_stub_templates() -> None:
    """Every anomaly kind fusion can emit must have a stub attribution template.

    Without this, the stub falls back to a generic "Unknown" attribution and
    the demo loses narrative — the failure mode is silent and content-shaped
    rather than crash-shaped.
    """
    from halo.services.llm.stub import _KIND_TO_ATTRIBUTION

    pattern_kinds = set(DOMAIN_PATTERN_MAP.values())
    orbital_kinds = {
        "orbital_collection_risk",
        "orbital_collection_overlap",
        "orbital_collection_correlated",
        "orbital_rpo_risk",
    }
    expected_kinds = pattern_kinds | orbital_kinds

    missing = sorted(expected_kinds - set(_KIND_TO_ATTRIBUTION))
    assert not missing, (
        f"{len(missing)} anomaly kind(s) emitted by fusion lack a stub "
        f"template in halo/services/llm/stub.py:_KIND_TO_ATTRIBUTION: "
        f"{missing}. Add an _AttribTemplate for each."
    )
