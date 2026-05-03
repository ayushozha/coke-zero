# React + TypeScript + Vite

HALO is our national security hackathon project for CANOPY: a tactical space and multi-domain awareness system for brigade-level decision support.

The demo turns orbital, RF/EW, cyber, PNT, SATCOM, drone, HUMINT, and OSINT signals into a common data stream so the backend can fuse anomalies and the frontend can show commanders what is happening, why it matters, and what action to take next.

## What is in this repo

- `services/bus/schemas/` - canonical `Signal` and derived `Anomaly` schemas
- `services/ingest/` - adapters that normalize real and mock sources into Signals
- `services/fusion/` - prototype fusion logic, including orbital RPO anomaly detection
- `scenarios/` - deterministic JSONL demo beats for the hackathon runthrough
- `scripts/` - validation, replay, and orbital cache tooling
- `data/` - source registry, KB seeds, orbital cache metadata, and expected UI fixtures
- `docs/` - data contract, source notes, and backend/frontend handoff notes

## Demo flow

The scenario is split into four beats:

- `beat1` - baseline orbital and OSINT setup
- `beat2` - RF, cyber, PNT, and drone spoofing injects
- `beat4` - convergence across domains
- `beat47` - SATCOM degradation and RPO close-approach escalation

Every record is a canonical `Signal`, whether it comes from a public source, a mock operational feed, or a synthetic orbital overlay.

## Quick start

Install dependencies with `uv`. If `uv` is not on your `PATH`, the repo-local
`./run` helper will also use `$HOME/.local/bin/uv`.

```bash
./run python scripts/validate_scenarios.py
./run python scripts/replay.py scenarios/beat2.jsonl --dry-run
./run python scripts/replay.py scenarios/beat47.jsonl --dry-run | ./run python services/fusion/orbital_anomaly.py
```

Run tests:

```bash
./run pytest
./run python scripts/verify.py
```

Live Claude run, after adding `ANTHROPIC_API_KEY` to `.env`:

```bash
./run python scripts/verify.py --live scenarios/iran_counter_c5isr_brigade.jsonl
```

## Core idea

HALO keeps the data contract simple: every source emits the same `Signal` shape. That lets teammates build backend fusion, decision logic, and frontend views without rewriting source-specific data handling during the hackathon.
