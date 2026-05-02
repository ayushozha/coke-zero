# CANOPY Data Lane

The data lane owns the contract between sources and the CANOPY engine. Every
adapter, real or mock, emits a canonical `Signal`; downstream services convert
`Signal -> Anomaly -> Attribution -> Decision -> UIEvent`.

## Owned Paths

- `services/bus/schemas/`
- `services/ingest/`
- `scenarios/*.jsonl`
- `scripts/replay.py`
- `scripts/validate_scenarios.py`
- `data/source_registry.json`
- `data/orbital/cache/manifest.json`

## Validation

Validate all scenario feeds:

```bash
python3 scripts/validate_scenarios.py
```

Validate one feed:

```bash
python3 scripts/validate_scenarios.py scenarios/beat2.jsonl
```

If the `jsonschema` package is installed, the script validates against
`services/bus/schemas/signal.schema.json`. Without that dependency, it still
runs semantic checks for required fields, allowed domains, allowed realism
labels, confidence bounds, provenance, and monotonic timestamps.

## Replay

Print records to stdout at their timestamp cadence:

```bash
python3 scripts/replay.py scenarios/beat2.jsonl --flush
```

Replay quickly for local tests:

```bash
python3 scripts/replay.py scenarios/beat2.jsonl --speed 20 --flush
```

POST records into a backend ingest endpoint:

```bash
python3 scripts/replay.py scenarios/beat2.jsonl --post-url http://localhost:8000/signals
```

## Realism Labels

- `real_source`: public, citable data such as CelesTrak, CSIS, SWF, or OSM.
- `mock_operational`: synthetic HUMINT, RF/EW, cyber, PNT, SATCOM, or drone inject.
- `synthetic_orbital_overlay`: fictional maneuver/RPO objects used for the demo.
