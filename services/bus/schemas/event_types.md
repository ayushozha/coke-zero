# CANOPY event types

Signal adapters use `payload.event_type`. Some prototype fusion tools also accept
legacy `payload.event` for compatibility, but new scenario feeds should stay on
the canonical Signal schema.

drone:
- `telemetry_update`
- `degraded_telemetry`

rf_ew:
- `rf_interference`
- `satcom_rf_spike`

pnt:
- `gps_spoof`

orbit:
- `orbital_setup`
- `screening_overlay`
- `rpo_close_approach`
- `proximity_operations`

satcom:
- `satcom_degradation`
- `satcom_link_margin_drop`

cyber:
- `ground_segment_baseline`
- `credential_probe`

osint:
- `osint_context`
- `collection_cue`
- `campaign_assessment`
- `close_approach_assessment`

humint:
- `procurement_report`
