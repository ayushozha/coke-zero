from __future__ import annotations

import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import jsonschema

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts import replay, validate_scenarios  # noqa: E402
from services.ingest import cyber, drone, humint, orbit, osint, pnt, rf_ew, satcom, sda, terrain  # noqa: E402
from services.ingest.common import iter_domain_signals  # noqa: E402


SCENARIO_DIR = ROOT / "scenarios"
SIGNAL_SCHEMA = ROOT / "services" / "bus" / "schemas" / "signal.schema.json"
EXAMPLES_DIR = ROOT / "services" / "bus" / "schemas" / "examples"


class DataLaneBehaviorTest(unittest.TestCase):
    def setUp(self) -> None:
        self.scenarios = sorted(SCENARIO_DIR.glob("*.jsonl"))
        self.assertGreater(len(self.scenarios), 0, "expected checked-in scenario JSONL files")

    def test_checked_in_scenarios_validate_successfully(self) -> None:
        validator, warning = validate_scenarios.load_json_schema_validator(SIGNAL_SCHEMA)

        self.assertIsNone(warning)
        self.assertIsNotNone(validator)

        total_records = 0
        all_errors: list[str] = []
        for scenario in self.scenarios:
            records, errors = validate_scenarios.validate_file(scenario, validator)
            total_records += records
            all_errors.extend(errors)

        self.assertGreater(total_records, 0)
        self.assertEqual([], all_errors)

    def test_replay_dry_run_emits_compact_jsonl_records_without_sleeping(self) -> None:
        scenario = SCENARIO_DIR / "beat1.jsonl"
        expected_records = replay.load_records(scenario)
        stdout = io.StringIO()
        argv = ["replay.py", str(scenario), "--dry-run", "--cadence-ms", "5000"]

        with mock.patch.object(sys, "argv", argv):
            with mock.patch.object(replay.time, "sleep", side_effect=AssertionError("dry-run slept")):
                with contextlib.redirect_stdout(stdout):
                    exit_code = replay.main()

        lines = stdout.getvalue().splitlines()
        parsed_records = [json.loads(line) for line in lines]

        self.assertEqual(0, exit_code)
        self.assertEqual(expected_records, parsed_records)
        self.assertEqual(len(expected_records), len(lines))
        # The dry-run must emit compact JSON (no whitespace between tokens).
        # Compare each line against the canonical compact serialization rather
        # than scanning for ", " / ": " — the latter false-positives on any
        # prose summary that contains natural English punctuation.
        for line, record in zip(lines, parsed_records, strict=True):
            self.assertEqual(json.dumps(record, separators=(",", ":")), line)

    def test_ingest_adapters_filter_to_their_own_domain(self) -> None:
        adapters = {
            "cyber": cyber,
            "drone": drone,
            "humint": humint,
            "orbit": orbit,
            "osint": osint,
            "pnt": pnt,
            "rf_ew": rf_ew,
            "satcom": satcom,
            "sda": sda,
            "terrain": terrain,
        }
        example_signals = [
            json.loads(example_path.read_text(encoding="utf-8"))
            for example_path in sorted(EXAMPLES_DIR.glob("*.json"))
        ]

        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".jsonl") as feed:
            for signal in example_signals:
                feed.write(json.dumps(signal) + "\n")
            feed.flush()

            for domain, adapter in adapters.items():
                with self.subTest(domain=domain):
                    expected_signals = list(iter_domain_signals(feed.name, domain))
                    adapter_signals = list(adapter.iter_signals(feed.name))

                    self.assertEqual(expected_signals, adapter_signals)
                    self.assertEqual(1, len(adapter_signals))
                    self.assertEqual({domain}, {signal["domain"] for signal in adapter_signals})

    def test_schema_examples_validate_against_signal_and_payload_schemas(self) -> None:
        signal_schema = json.loads(SIGNAL_SCHEMA.read_text(encoding="utf-8"))
        signal_validator = jsonschema.Draft202012Validator(signal_schema)
        example_paths = sorted(EXAMPLES_DIR.glob("*.json"))

        self.assertGreater(len(example_paths), 0, "expected checked-in schema examples")

        for example_path in example_paths:
            with self.subTest(example=example_path.name):
                example = json.loads(example_path.read_text(encoding="utf-8"))
                signal_validator.validate(example)


if __name__ == "__main__":
    unittest.main()
