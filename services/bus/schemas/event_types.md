# CANOPY event types

Signal adapters use `payload.event_type`. Some prototype fusion tools also accept
legacy `payload.event` for compatibility, but new scenario feeds should stay on
the canonical Signal schema.

drone:
- `telemetry_update`
- `degraded_telemetry`
- `fdir_recovery_action`
- `relay_mesh_status`
- `relay_candidate_ready`
- `autonomous_relay_handoff`

rf_ew:
- `rf_interference`
- `satcom_rf_spike`
- `emission_posture_risk`

pnt:
- `gps_spoof`

orbit:
- `orbital_setup`
- `screening_overlay`
- `overhead_collection_window`
- `rpo_close_approach`
- `proximity_operations`

satcom:
- `satcom_degradation`
- `satcom_link_margin_drop`

cyber:
- `ground_segment_baseline`
- `credential_probe`
- `credential_spray`

osint:
- `osint_context`
- `collection_cue`
- `fdir_assessment`
- `relay_resilience_assessment`
- `collection_risk_assessment`
- `multi_domain_attack_assessment`
- `campaign_assessment`
- `close_approach_assessment`

humint:
- `procurement_report`

sda:
- `sda_catalog_match`

terrain:
- `terrain_masking_risk`
