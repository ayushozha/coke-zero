"""Generate procedural scenario variants from the labeled seeds.

For each seed in ``bench/seeds.yaml``, produce N variants by perturbing
miss_distance, range, confidence, and TCA within the configured envelope.
Variants land under ``bench/scenarios/`` as JSONL alongside a small
labels file so the harness can score them against the inherited label.

Usage:

    uv run python -m bench.generate --variants 4
"""
from __future__ import annotations

import argparse
import copy
import json
import logging
import random
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parent.parent
SEEDS_YAML = Path(__file__).resolve().parent / "seeds.yaml"
SCENARIOS_DIR = Path(__file__).resolve().parent / "scenarios"
SOURCE_DIR = ROOT / "scenarios"

log = logging.getLogger(__name__)


def _perturb_record(
    rec: dict[str, Any],
    *,
    miss_jitter: float,
    range_jitter: float,
    confidence_jitter: float,
    rng: random.Random,
    id_suffix: str,
) -> dict[str, Any]:
    out = copy.deepcopy(rec)

    # Suffix the signal id so the engine doesn't dedupe variants against
    # the seed (FusionService keeps a seen_signals set per run; running
    # multiple variants through the same engine would otherwise collapse).
    if "id" in out and isinstance(out["id"], str):
        out["id"] = f"{out['id']}-{id_suffix}"

    if "confidence" in out and isinstance(out["confidence"], (int, float)):
        delta = rng.uniform(-confidence_jitter, confidence_jitter)
        out["confidence"] = round(max(0.05, min(0.99, out["confidence"] + delta)), 3)

    payload = out.get("payload") or {}
    obs = payload.get("observables") or {}
    if "miss_distance_km" in obs:
        delta = rng.uniform(-miss_jitter, miss_jitter)
        obs["miss_distance_km"] = round(max(0.5, obs["miss_distance_km"] + delta), 2)
    if "range_km" in obs:
        delta = rng.uniform(-range_jitter, range_jitter)
        obs["range_km"] = round(max(0.1, obs["range_km"] + delta), 2)
    payload["observables"] = obs
    out["payload"] = payload
    return out


def _load_seed_records(seed_file: str) -> list[dict[str, Any]]:
    path = SOURCE_DIR / seed_file
    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            stripped = line.strip()
            if stripped:
                records.append(json.loads(stripped))
    return records


def generate(*, variants_per_seed: int, seed: int = 1337) -> list[dict[str, Any]]:
    """Generate variants. Returns a list of variant labels."""
    SCENARIOS_DIR.mkdir(parents=True, exist_ok=True)

    config = yaml.safe_load(SEEDS_YAML.read_text())
    gen = config.get("generation", {}) or {}
    miss_jitter = float(gen.get("miss_distance_jitter_km", 6.0))
    range_jitter = float(gen.get("range_km_jitter", 3.0))
    conf_jitter = float(gen.get("confidence_jitter", 0.1))

    variant_labels: list[dict[str, Any]] = []
    rng = random.Random(seed)

    for seed_label in config["seeds"]:
        seed_file = seed_label["file"]
        try:
            records = _load_seed_records(seed_file)
        except FileNotFoundError:
            log.warning("seed file missing: %s", seed_file)
            continue
        for i in range(variants_per_seed):
            id_suffix = f"v{i+1:02d}"
            variant_records = [
                _perturb_record(
                    r,
                    miss_jitter=miss_jitter,
                    range_jitter=range_jitter,
                    confidence_jitter=conf_jitter,
                    rng=rng,
                    id_suffix=id_suffix,
                )
                for r in records
            ]
            stem = Path(seed_file).stem
            out_name = f"{stem}__v{i+1:02d}.jsonl"
            out_path = SCENARIOS_DIR / out_name
            with out_path.open("w", encoding="utf-8") as fh:
                for rec in variant_records:
                    fh.write(json.dumps(rec) + "\n")
            variant_labels.append(
                {
                    "file": str(out_path.relative_to(Path(__file__).resolve().parent)),
                    "seed_file": seed_file,
                    "expected_actor": seed_label["expected_actor"],
                    "expected_action": seed_label["expected_action"],
                    "expected_authority": seed_label["expected_authority"],
                    "confidence_band": seed_label.get("confidence_band", "med"),
                }
            )

    labels_path = SCENARIOS_DIR / "labels.json"
    labels_path.write_text(json.dumps(variant_labels, indent=2))
    log.info(
        "generated %d variants across %d seeds → %s",
        len(variant_labels),
        len(config["seeds"]),
        SCENARIOS_DIR,
    )
    return variant_labels


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--variants", type=int, default=4)
    parser.add_argument("--seed", type=int, default=1337)
    args = parser.parse_args()

    variants = generate(variants_per_seed=args.variants, seed=args.seed)
    print(f"generated {len(variants)} variants under {SCENARIOS_DIR}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
