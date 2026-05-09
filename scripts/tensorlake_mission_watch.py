from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coke_zero.services.tensorlake_watch import (
    DEFAULT_TENSORLAKE_OUTPUT_DIR,
    DEFAULT_TENSORLAKE_SCENARIO,
    TensorlakeMissionWatchConfig,
    TensorlakeSetupError,
    run_tensorlake_mission_watch_sync,
)


def _optional_float(value: str) -> float | None:
    if value.lower() in {"none", "off", "false"}:
        return None
    return float(value)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="tensorlake_mission_watch",
        description=(
            "Launch one coke-zero mission-watch cycle through the Tensorlake "
            "worker shim and capture structured evidence logs."
        ),
    )
    parser.add_argument(
        "--scenario",
        action="append",
        default=[],
        help=(
            "Scenario JSONL file to run. Repeat for multiple files. Defaults "
            "to the primary always-on demo scenario."
        ),
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_TENSORLAKE_OUTPUT_DIR),
        help="Directory where per-run Tensorlake evidence artifacts are written.",
    )
    parser.add_argument(
        "--llm",
        default="stub",
        choices=["stub", "anthropic", "ollama"],
        help="LLM provider used by the isolated mission-watch worker.",
    )
    parser.add_argument("--scenario-speed", type=float, default=200.0)
    parser.add_argument(
        "--scenario-max-delay-s",
        type=_optional_float,
        default=0.05,
        help="Maximum replay delay between signals, or 'none' to preserve timing.",
    )
    parser.add_argument("--drain-s", type=float, default=4.0)
    parser.add_argument("--attrib-window-s", type=float, default=0.5)
    parser.add_argument(
        "--include-osint-cluster",
        action="store_true",
        help="Also run the optional embedding worker; this may load a local model.",
    )
    parser.add_argument(
        "--local-shim",
        action="store_true",
        help=(
            "Run the Tensorlake-compatible worker locally without requiring "
            "TENSORLAKE_API_KEY. Use this for captured demo evidence when the "
            "cloud sandbox is not configured."
        ),
    )
    parser.add_argument(
        "--ignore-dotenv",
        action="store_true",
        help="Do not load local .env before checking Tensorlake setup.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    args = build_parser().parse_args(argv)
    scenarios = tuple(Path(s) for s in args.scenario) or (DEFAULT_TENSORLAKE_SCENARIO,)

    try:
        evidence = run_tensorlake_mission_watch_sync(
            TensorlakeMissionWatchConfig(
                scenarios=scenarios,
                output_dir=args.output_dir,
                provider=args.llm,
                scenario_speed=args.scenario_speed,
                scenario_max_delay_s=args.scenario_max_delay_s,
                drain_s=args.drain_s,
                attrib_window_s=args.attrib_window_s,
                local_shim=args.local_shim,
                include_osint_cluster=args.include_osint_cluster,
                load_env_file=not args.ignore_dotenv,
            )
        )
    except TensorlakeSetupError as exc:
        print(f"[Tensorlake setup] {exc}", file=sys.stderr)
        return 2

    print(json.dumps(evidence.to_json(), indent=2, ensure_ascii=True))
    return 0 if evidence.status == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
