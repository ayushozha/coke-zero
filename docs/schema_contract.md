# CANOPY Signal Schema Contract

Every CANOPY adapter emits a canonical Signal envelope. The envelope is stable
across real, mock, and synthetic feeds so downstream services can process
signals before they understand a domain-specific payload.

## Canonical Envelope

Required top-level fields:

- `id`: Non-empty signal identifier, unique within a feed.
- `ts`: RFC 3339 / JSON Schema `date-time` timestamp for the observation.
- `domain`: One of `sda`, `orbit`, `osint`, `humint`, `rf_ew`, `cyber`,
  `pnt`, `satcom`, `drone`, or `terrain`.
- `source`: Non-empty adapter or feed name.
- `realism`: One of `real_source`, `mock_operational`, or
  `synthetic_orbital_overlay`.
- `confidence`: Number from `0` to `1`.
- `location`: Object describing where the signal applies. Point locations use
  `lat` and `lng`; area locations may use `area_wkt`; grid references may use
  `mgrs`; abstract or orbital context may use `label`. Optional altitude and
  uncertainty fields include `alt_km`, `alt_m`, and `ce_m`.
- `payload`: Domain-specific observation object. Every payload carries
  `event_type` and `summary`; optional common fields include `beat`, `asset`,
  and `observables`.
- `provenance`: Source traceability object. `source_id` is required. Optional
  fields include `collector`, `method`, `references`, `generated_at`,
  `citation`, and `notes`.

## Payload Schemas

Domain payload schemas under `services/bus/schemas/payloads/` define the
stricter shape for adapter-native payloads. They include the canonical
`event_type` and `summary` fields so a payload that validates against a domain
schema can also satisfy the canonical Signal payload contract.

Scenario feeds may include additional payload fields such as `beat`, `asset`,
and nested `observables`; the canonical Signal schema intentionally permits
those scenario fields while still requiring the stable envelope above.
