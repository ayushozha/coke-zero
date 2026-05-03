#!/usr/bin/env python3
"""Refresh the public N2YO position cache used by the GUI."""

from __future__ import annotations

import argparse
import json
import os
import tempfile
import urllib.error
import urllib.request
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SATELLITE_ID = 45465
DEFAULT_OUTPUT_DIR = REPO_ROOT / "public" / "orbital"
N2YO_BASE_URL = "https://api.n2yo.com/rest/v1/satellite"
ORBIT_SAMPLE_COUNT = 360


class N2YOError(RuntimeError):
    pass


def load_env() -> None:
    for name in (".env", ".env.local", "env"):
        load_dotenv(REPO_ROOT / name, override=False)


def utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def timestamp_to_utc(timestamp: int) -> str:
    return datetime.fromtimestamp(timestamp, UTC).isoformat().replace("+00:00", "Z")


def fetch_text(url: str, timeout_s: float) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "HALO N2YO GUI cache/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=timeout_s) as response:
            return response.read().decode("utf-8")
    except urllib.error.URLError as exc:
        raise N2YOError(f"failed to fetch N2YO data: {exc}") from exc


def fetch_json(url: str, timeout_s: float) -> dict[str, Any]:
    payload = fetch_text(url, timeout_s)

    try:
        value = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise N2YOError(f"N2YO returned invalid JSON: {exc}") from exc

    if not isinstance(value, dict):
        raise N2YOError("N2YO returned an unexpected JSON shape")
    return value


def fetch_tle(satellite_id: int, api_key: str, timeout_s: float) -> tuple[str, str]:
    payload = fetch_json(f"{N2YO_BASE_URL}/tle/{satellite_id}&apiKey={api_key}", timeout_s)
    tle = payload.get("tle")
    if not isinstance(tle, str):
        raise N2YOError("N2YO TLE response is missing tle")
    lines = [line.strip() for line in tle.splitlines() if line.strip()]
    if len(lines) != 2:
        raise N2YOError("N2YO TLE response did not contain two TLE lines")
    return lines[0], lines[1]


def propagate_orbit(
    satellite_name: str,
    line1: str,
    line2: str,
    start: datetime,
) -> list[dict[str, Any]]:
    from skyfield.api import EarthSatellite, load, wgs84

    ts = load.timescale()
    satellite = EarthSatellite(line1, line2, satellite_name, ts)
    period_minutes = (2 * 3.141592653589793) / satellite.model.no_kozai
    orbit: list[dict[str, Any]] = []

    for index in range(ORBIT_SAMPLE_COUNT + 1):
        sample_time = start + timedelta(minutes=(period_minutes * index) / ORBIT_SAMPLE_COUNT)
        geocentric = satellite.at(ts.from_datetime(sample_time))
        subpoint = wgs84.subpoint(geocentric)
        orbit.append(
            {
                "timestamp_utc": sample_time.replace(microsecond=0)
                .isoformat()
                .replace("+00:00", "Z"),
                "lat": float(subpoint.latitude.degrees),
                "lng": float(subpoint.longitude.degrees),
                "alt_km": float(subpoint.elevation.km),
            }
        )

    return orbit


def normalize(
    payload: dict[str, Any],
    fetched_at: str,
    observer: dict[str, float],
    tle: tuple[str, str],
) -> dict[str, Any]:
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

    satellite_id = int(info.get("satid", DEFAULT_SATELLITE_ID))
    satellite_name = str(info.get("satname", f"NORAD {DEFAULT_SATELLITE_ID}"))
    fetched_dt = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))

    return {
        "source": "n2yo",
        "source_endpoint": "positions+tle",
        "realism": "real_source",
        "fetched_at": fetched_at,
        "satellite": {
            "id": satellite_id,
            "name": satellite_name,
        },
        "observer": observer,
        "transactions_count": info.get("transactionscount"),
        "tle": {
            "line1": tle[0],
            "line2": tle[1],
        },
        "track": track,
        "orbit": propagate_orbit(satellite_name, tle[0], tle[1], fetched_dt),
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


def default_output_path(satellite_id: int) -> Path:
    return DEFAULT_OUTPUT_DIR / f"n2yo_{satellite_id}_positions.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--satellite-id", type=int, default=DEFAULT_SATELLITE_ID)
    parser.add_argument("--seconds", type=int, default=300, help="N2YO position samples, max 300")
    parser.add_argument("--observer-lat", type=float, default=None)
    parser.add_argument("--observer-lng", type=float, default=None)
    parser.add_argument("--observer-alt-m", type=float, default=None)
    parser.add_argument("--output", type=Path, default=None)
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
    fetched_at = utc_now()
    tle = fetch_tle(args.satellite_id, api_key, args.timeout_s)
    normalized = normalize(fetch_json(url, args.timeout_s), fetched_at, observer, tle)
    output = args.output or default_output_path(args.satellite_id)
    output = output if output.is_absolute() else REPO_ROOT / output
    write_json(output, normalized)
    sat = normalized["satellite"]
    print(f"wrote {len(normalized['track'])} point(s) for {sat['name']} ({sat['id']}) to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
