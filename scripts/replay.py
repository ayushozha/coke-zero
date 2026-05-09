#!/usr/bin/env python3
"""Replay coke-zero scenario JSONL records deterministically."""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib import request


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def load_records(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                record = json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise SystemExit(f"{path}:{line_no}: invalid JSON: {exc}") from exc
            if not isinstance(record, dict):
                raise SystemExit(f"{path}:{line_no}: record must be a JSON object")
            records.append(record)
    return records


def sleep_between(
    previous: dict[str, Any] | None,
    current: dict[str, Any],
    *,
    speed: float,
    cadence_ms: int | None,
    dry_run: bool,
) -> None:
    if previous is None or dry_run:
        return

    if cadence_ms is not None:
        delay = cadence_ms / 1000
    else:
        previous_ts = parse_ts(previous["ts"])
        current_ts = parse_ts(current["ts"])
        delay = max(0.0, (current_ts - previous_ts).total_seconds())

    delay = delay / speed
    if delay > 0:
        time.sleep(delay)


def post_record(url: str, record: dict[str, Any], timeout: float) -> None:
    payload = json.dumps(record).encode("utf-8")
    req = request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=timeout) as response:  # noqa: S310 - user-supplied local demo URL
        response.read()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scenario", help="Scenario JSONL file to replay")
    parser.add_argument("--speed", type=float, default=1.0, help="Playback multiplier")
    parser.add_argument("--cadence-ms", type=int, help="Use a fixed cadence instead of scenario timestamps")
    parser.add_argument("--post-url", help="POST each Signal to this URL instead of printing to stdout")
    parser.add_argument("--timeout", type=float, default=5.0, help="POST timeout in seconds")
    parser.add_argument("--dry-run", action="store_true", help="Emit immediately without sleeping")
    parser.add_argument("--flush", action="store_true", help="Flush stdout after each record")
    args = parser.parse_args()

    if args.speed <= 0:
        print("error: --speed must be positive", file=sys.stderr)
        return 2

    records = load_records(Path(args.scenario))
    previous: dict[str, Any] | None = None

    for record in records:
        sleep_between(
            previous,
            record,
            speed=args.speed,
            cadence_ms=args.cadence_ms,
            dry_run=args.dry_run,
        )

        if args.post_url:
            post_record(args.post_url, record, args.timeout)
        else:
            print(json.dumps(record, separators=(",", ":")))
            if args.flush:
                sys.stdout.flush()

        previous = record

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
