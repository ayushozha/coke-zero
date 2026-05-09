# Scenario GUI Integration Plan

## Goal

Make the Brigade view run any of the 11 checked-in scenarios as a simple
commander demo: choose a story, press play, watch coke-zero brief what changed,
why it matters, and whether a decision is needed.

## Scenario Groups

### Primary judge demos

- `iran_counter_c5isr_brigade.jsonl`: main brigade space-support crisis.
- `army_multidomain_attack_chain.jsonl`: full counter-C5ISR attack chain.
- `beat47.jsonl`: pure RPO plus SATCOM escalation.

### Simple tactical demos

- `army_relay_reconfig.jsonl`: drone relay switches to preserve ISR.
- `army_drone_fdir.jsonl`: drone isolates bad GPS and recovers.
- `army_satellite_collection_risk.jsonl`: pause/reduce emissions before overhead collection.

### Iran theater demos

- `iran_hormuz_convoy_resilience.jsonl`: convoy hold until PNT/SATCOM/SAR confidence recovers.
- `iran_proxy_uas_base_defense.jsonl`: overhead warning plus base-defense pressure.

### Four-beat original story

- `beat1.jsonl`: establish normal space and collection context.
- `beat2.jsonl`: first RF/cyber/PNT/drone disruption.
- `beat4.jsonl`: multi-domain convergence.
- `beat47.jsonl`: RPO/SATCOM escalation.

## Frontend Work

1. Add a Scenario Drawer to the Brigade view.
2. Each scenario card should show:
   - plain title
   - one-sentence commander story
   - expected effect: `Threat update` or `Decision request`
   - estimated runtime
3. Add controls:
   - `Play`
   - `Pause`
   - `Reset`
   - `Speed`
4. Use `POST /signals` for replay. The frontend can either:
   - call a backend `/scenarios/{id}/play` endpoint, preferred; or
   - stream scenario JSONL records directly in dev mode.
5. Reset should clear runtime history before replay so each story starts clean.

## Backend Work

1. Add `GET /scenarios`.
2. Add `POST /scenarios/{id}/play`.
3. Add `POST /runtime/reset`.
4. Include a stable metadata file, `scenarios/manifest.json`, with:
   - scenario id
   - title
   - group
   - description
   - recommended demo order
   - expected UI result

## Recommended Demo Order

1. `army_relay_reconfig.jsonl`
2. `beat47.jsonl`
3. `iran_counter_c5isr_brigade.jsonl`
4. `army_multidomain_attack_chain.jsonl`

This order starts simple, proves the space-specific feature, then shows the
full Army/Iran operational story.
