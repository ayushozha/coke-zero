#!/usr/bin/env python3
"""Fetch or stage CelesTrak orbital catalog cache files for coke-zero.

The script is deterministic in offline mode so CI and local tests do not need
network access. Live refreshes are explicit and rate-limit conscious.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tempfile
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CACHE_DIR = REPO_ROOT / "data" / "orbital" / "cache"
DEFAULT_FIXTURE_DIR = REPO_ROOT / "data" / "orbital" / "curated" / "fixtures"
DEFAULT_MANIFEST = DEFAULT_CACHE_DIR / "manifest.json"


@dataclass(frozen=True)
class Dataset:
    dataset_id: str
    url: str
    description: str


DATASETS: tuple[Dataset, ...] = (
    Dataset(
        "geo",
        "https://celestrak.org/NORAD/elements/gp.php?GROUP=GEO&FORMAT=JSON",
        "GEO/SATCOM environment for public catalog context.",
    ),
    Dataset(
        "gps-ops",
        "https://celestrak.org/NORAD/elements/gp.php?GROUP=GPS-OPS&FORMAT=JSON",
        "Operational GPS constellation for PNT context.",
    ),
    Dataset(
        "starlink",
        "https://celestrak.org/NORAD/elements/gp.php?GROUP=STARLINK&FORMAT=JSON",
        "Commercial SATCOM constellation context.",
    ),
    Dataset(
        "planet",
        "https://celestrak.org/NORAD/elements/gp.php?GROUP=PLANET&FORMAT=JSON",
        "Commercial EO constellation context.",
    ),
    Dataset(
        "gpz-plus",
        "https://celestrak.org/NORAD/elements/gp.php?SPECIAL=GPZ-PLUS&FORMAT=JSON",
        "GEO protected-zone context for RPO-adjacent visualization.",
    ),
)


class CacheError(RuntimeError):
    """Raised when a dataset cannot be fetched, loaded, or validated."""


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(value, indent=2, sort_keys=True).encode("utf-8") + b"\n"


def read_json_array(path: Path) -> list[dict[str, Any]]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise CacheError(f"missing offline fixture: {path}") from exc
    except json.JSONDecodeError as exc:
        raise CacheError(f"invalid JSON in {path}: {exc}") from exc
    if not isinstance(value, list):
        raise CacheError(f"expected JSON array in {path}")
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            raise CacheError(f"expected object at {path}[{index}]")
    return value


def validate_celestrak_records(dataset_id: str, records: list[dict[str, Any]]) -> None:
    if not records:
        raise CacheError(f"{dataset_id} contained no records")

    required_any = ("NORAD_CAT_ID", "OBJECT_NAME", "OBJECT_ID")
    for index, record in enumerate(records):
        if not any(key in record for key in required_any):
            raise CacheError(
                f"{dataset_id}[{index}] is missing all identity keys: {', '.join(required_any)}"
            )


def fetch_url(url: str, timeout_s: float) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "coke-zero orbital cache worker/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=timeout_s) as response:
            return response.read()
    except urllib.error.URLError as exc:
        raise CacheError(f"failed to fetch {url}: {exc}") from exc


def load_dataset(dataset: Dataset, mode: str, fixture_dir: Path, timeout_s: float) -> tuple[list[dict[str, Any]], str]:
    if mode == "offline":
        records = read_json_array(fixture_dir / f"{dataset.dataset_id}.json")
        return records, "offline_fixture"

    payload = fetch_url(dataset.url, timeout_s)
    try:
        value = json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise CacheError(f"invalid CelesTrak JSON for {dataset.dataset_id}: {exc}") from exc
    if not isinstance(value, list):
        raise CacheError(f"expected CelesTrak JSON array for {dataset.dataset_id}")
    return value, "celestrak_live"


def atomic_write(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as tmp:
        tmp.write(payload)
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)


def build_manifest_entry(
    dataset: Dataset,
    records: list[dict[str, Any]],
    payload: bytes,
    fetched_at: str,
    source_mode: str,
    output_path: Path,
) -> dict[str, Any]:
    return {
        "id": dataset.dataset_id,
        "url": dataset.url,
        "cache_path": str(output_path.relative_to(REPO_ROOT)),
        "realism": "real_source" if source_mode == "celestrak_live" else "offline_fixture",
        "source_mode": source_mode,
        "fetched_at": fetched_at if source_mode == "celestrak_live" else None,
        "cached_at": fetched_at,
        "sha256": sha256_bytes(payload),
        "object_count": len(records),
        "notes": dataset.description,
    }


def write_cache(
    datasets: list[Dataset],
    mode: str,
    cache_dir: Path,
    fixture_dir: Path,
    manifest_path: Path,
    timeout_s: float,
    dry_run: bool,
) -> dict[str, Any]:
    cached_at = utc_now()
    manifest_entries: list[dict[str, Any]] = []

    for dataset in datasets:
        records, source_mode = load_dataset(dataset, mode, fixture_dir, timeout_s)
        validate_celestrak_records(dataset.dataset_id, records)
        payload = canonical_json_bytes(records)
        output_path = cache_dir / f"{dataset.dataset_id}.json"
        if not dry_run:
            atomic_write(output_path, payload)
        manifest_entries.append(
            build_manifest_entry(dataset, records, payload, cached_at, source_mode, output_path)
        )

    manifest = {
        "cache_version": "coke-zero-orbital-cache-v1",
        "updated_at": cached_at,
        "mode": "offline_fixture" if mode == "offline" else "celestrak_live",
        "refresh_policy": "Manual refresh only; do not refresh CelesTrak data more often than every 2 hours.",
        "datasets": manifest_entries,
        "synthetic_overlays": [
            {
                "id": "SATCOM-3",
                "realism": "synthetic_orbital_overlay",
                "cache_path": "data/orbital/curated/rpo_placeholders.json",
                "notes": "Fictional friendly SATCOM dependency used for Beat 4.7.",
            },
            {
                "id": "coke-zero-RPO-1",
                "realism": "synthetic_orbital_overlay",
                "cache_path": "data/orbital/curated/rpo_placeholders.json",
                "notes": "Fictional inspector object used to demonstrate close-approach detection.",
            },
        ],
    }
    if not dry_run:
        atomic_write(manifest_path, canonical_json_bytes(manifest))
    return manifest


def selected_datasets(names: list[str]) -> list[Dataset]:
    by_id = {dataset.dataset_id: dataset for dataset in DATASETS}
    if not names:
        return list(DATASETS)
    missing = sorted(set(names) - set(by_id))
    if missing:
        raise CacheError(f"unknown dataset id(s): {', '.join(missing)}")
    return [by_id[name] for name in names]


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mode",
        choices=("offline", "live"),
        default="offline",
        help="offline copies curated fixtures; live fetches CelesTrak URLs",
    )
    parser.add_argument(
        "--dataset",
        action="append",
        default=[],
        help="dataset id to process; repeat to select multiple; defaults to all",
    )
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE_DIR)
    parser.add_argument("--fixture-dir", type=Path, default=DEFAULT_FIXTURE_DIR)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--timeout-s", type=float, default=30.0)
    parser.add_argument("--dry-run", action="store_true", help="validate and print manifest without writing")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        manifest = write_cache(
            datasets=selected_datasets(args.dataset),
            mode=args.mode,
            cache_dir=args.cache_dir,
            fixture_dir=args.fixture_dir,
            manifest_path=args.manifest,
            timeout_s=args.timeout_s,
            dry_run=args.dry_run,
        )
    except CacheError as exc:
        print(f"fetch_orbital_cache: {exc}", file=sys.stderr)
        return 1

    if args.dry_run:
        print(json.dumps(manifest, indent=2, sort_keys=True))
    else:
        print(
            f"cached {len(manifest['datasets'])} dataset(s) via {manifest['mode']} "
            f"and updated {args.manifest}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
