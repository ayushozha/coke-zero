# HALO: High Altitude Loop Orchestrator

This branch focuses on the CANOPY data lane.

It defines the shared `Signal` contract, validates scenario feeds, and provides deterministic demo data for the backend and frontend teams to consume.

Main areas:
- `services/bus/schemas/` - canonical Signal and payload schemas
- `services/ingest/` - data adapters that emit Signals
- `scenarios/` - deterministic JSONL demo feeds
- `scripts/validate_scenarios.py` - schema validation
- `scripts/replay.py` - replay feeds into the system
- `data/` - source registry, orbital cache metadata, KB seeds, and expected UI fixtures

Goal: make every data source, real or mock, look the same to the rest of CANOPY.
