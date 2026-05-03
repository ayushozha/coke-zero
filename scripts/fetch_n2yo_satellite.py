#!/usr/bin/env python3
"""Refresh the public N2YO position cache used by the GUI."""

from __future__ import annotations

import argparse
import json
import os
import tempfile
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SATELLITE_ID = 45465
DEFAULT_OUTPUT = REPO_ROOT / "public" / "orbital" / "n2yo_45465_positions.json"
N2YO_BASE_URL = "https://api.n2yo.com/rest/v1/satellite"


class N2YOError(RuntimeError):
    pass


def load_env() -> None:
    for name in (".env", ".env.local", "env"):
        load_dotenv(REPO_ROOT / name, override=False)


def utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def timestamp_to_utc(timestamp: int) -> str:
    return datetime.fromtimestamp(timestamp, UTC).isoformat().replace("+00:00", "Z")


def fetch_json(url: str, timeout_s: float) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": "HALO N2YO GUI cache/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=timeout_s) as response:
            payload = response.read().decode("utf-8")
    except urllib.error.URLError as exc:
        raise N2YOError(f"failed to fetch N2YO positions: {exc}") from exc

    try:
        value = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise N2YOError(f"N2YO returned invalid JSON: {exc}") from exc

    if not isinstance(value, dict):
        raise N2YOError("N2YO returned an unexpected JSON shape")
    return value


def normalize(payload: dict[str, Any], fetched_at: str, observer: dict[str, float]) -> dict[str, Any]:
    info = payload.get("info")
    positions = payload.get("positions")
    if not isinstance(info, dict):
        raise N2YOError("N2YO response is missing info")
    if not isinstance(positions, list) or not positions:
        raise N2YOError("N2YO response is missing positions")

    track: list[dict[str, Any]] = []
    for index, position in enumerate(positions):
        if not isinstance(position, dict):
            raise N2YOError(f"N2YO positions[{index}] is not an object")
        timestamp = int(position["timestamp"])
        track.append(
            {
                "timestamp": timestamp,
                "timestamp_utc": timestamp_to_utc(timestamp),
                "lat": float(position["satlatitude"]),
                "lng": float(position["satlongitude"]),
                "alt_km": float(position["sataltitude"]),
                "azimuth_deg": float(position["azimuth"]),
                "elevation_deg": float(position["elevation"]),
                "ra_deg": float(position["ra"]),
                "dec_deg": float(position["dec"]),
            }
        )

    return {
        "source": "n2yo",
        "source_endpoint": "positions",
        "realism": "real_source",
        "fetched_at": fetched_at,
        "satellite": {
            "id": int(info.get("satid", DEFAULT_SATELLITE_ID)),
            "name": str(info.get("satname", f"NORAD {DEFAULT_SATELLITE_ID}")),
        },
        "observer": observer,
        "transactions_count": info.get("transactionscount"),
        "track": track,
    }


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, indent=2, sort_keys=True).encode("utf-8") + b"\n"
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as tmp:
        tmp.write(payload)
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)


def env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    return default if raw in (None, "") else float(raw)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--satellite-id", type=int, default=DEFAULT_SATELLITE_ID)
    parser.add_argument("--seconds", type=int, default=1, help="N2YO position samples, max 300")
    parser.add_argument("--observer-lat", type=float, default=None)
    parser.add_argument("--observer-lng", type=float, default=None)
    parser.add_argument("--observer-alt-m", type=float, default=None)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--timeout-s", type=float, default=20.0)
    return parser.parse_args()


def main() -> int:
    load_env()
    args = parse_args()
    api_key = os.environ.get("N2YO_API_KEY")
    if not api_key:
        raise N2YOError("set N2YO_API_KEY in .env, .env.local, env, or your shell")

    observer = {
        "lat": args.observer_lat if args.observer_lat is not None else env_float("N2YO_OBSERVER_LAT", 0.0),
        "lng": args.observer_lng if args.observer_lng is not None else env_float("N2YO_OBSERVER_LNG", 0.0),
        "alt_m": args.observer_alt_m if args.observer_alt_m is not None else env_float("N2YO_OBSERVER_ALT_M", 0.0),
    }
    seconds = max(1, min(args.seconds, 300))
    url = (
        f"{N2YO_BASE_URL}/positions/{args.satellite_id}/"
        f"{observer['lat']}/{observer['lng']}/{observer['alt_m']}/{seconds}/"
        f"&apiKey={api_key}"
    )
    normalized = normalize(fetch_json(url, args.timeout_s), utc_now(), observer)
    output = args.output if args.output.is_absolute() else REPO_ROOT / args.output
    write_json(output, normalized)
    sat = normalized["satellite"]
    print(f"wrote {len(normalized['track'])} point(s) for {sat['name']} ({sat['id']}) to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
