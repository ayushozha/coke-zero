# Iran Conflict Demo Scenarios

These feeds translate public reporting on the 2026 Iran crisis into
schema-valid CANOPY demo data with a space-first focus. The records are
fictionalized for the hackathon: they are not operational guidance, target
lists, or real intelligence.

The goal is to show what CANOPY would do for an Army or joint tactical user
when space-enabled services degrade: PNT, SATCOM, satellite ISR, overhead
warning, space-support workflows, and RPO/counterspace risk.

## Source Anchors

- CENTCOM announced mine-clearance activity in the Strait of Hormuz on
  April 11, 2026.
- CENTCOM announced blockade implementation for traffic entering or exiting
  Iranian ports beginning April 13, 2026 at 10:00 a.m. ET.
- CSIS reported that Hormuz traffic fell sharply after the crisis began.
- CSIS Missile Threat describes Iran's large missile arsenal and proliferation
  of missiles and UAS to partners and proxies.
- CSIS analysis of Iran's drone campaign emphasizes sustained drone pressure,
  resilient communications, and degraded-mode operation.
- USNI reported that missile attacks were a central risk to merchant shipping
  in the Strait of Hormuz during the current crisis.
- NCTC public profiles describe Iran-backed Iraqi militia access to UAS and
  attacks against U.S. forces.
- Secure World Foundation's 2025 counterspace report includes Iran among states
  developing counterspace-related capabilities.

## Scenario Files

### `scenarios/iran_hormuz_convoy_resilience.jsonl`

Question: what would CANOPY do at 10:00 a.m. ET on April 13, when the blockade
timeline hits and a theater sustainment convoy depends on space-enabled
navigation, SATCOM, UAS relay, and satellite maritime awareness?

Demo answer:

1. Start a theater space-support watch window from the public blockade time.
2. Use satellite AIS / imagery context to detect maritime picture collapse.
3. Flag GPS interference on the convoy corridor.
4. Hold convoy departure after shared GPS bias appears.
5. Preserve UAS overwatch as a local relay for space-derived ISR products.
6. Move command traffic to low-bandwidth SATCOM fallback.
7. Request SAR refresh over the convoy-linked route.
8. Recommend a hold until SAR refresh, alternate PNT confidence, and SATCOM
   fallback are confirmed.

### `scenarios/iran_proxy_uas_base_defense.jsonl`

Question: what would CANOPY do at 0130Z when a base in Iraq sees proxy UAS
warning signs and its space-support chain starts degrading?

Demo answer:

1. Load public militia/UAS risk context tied to base space-support nodes.
2. Use an overhead IR cue to start the warning chain.
3. Correlate the overhead cue with local RF control-link bursts.
4. Notice GPS timing degradation affecting perimeter sensor fusion.
5. Shift coordination from SATCOM to local radio fallback.
6. Lock the space-support request portal during cyber probes.
7. Preserve cached overhead products and local sensor custody.
8. Emit a confidence-scored space-enabled base-defense assessment without
   overclaiming attribution.

### `scenarios/iran_counter_c5isr_brigade.jsonl`

Question: what would CANOPY do when a brigade's space support stack degrades
inside the same short window: GPS, SATCOM, satellite-product distribution,
cyber access, and RPO risk?

Demo answer:

1. Preload Iran missile/UAS and counterspace context from public sources.
2. Detect drone-link EW disrupting satellite-product distribution.
3. Detect GNSS spoofing across multiple drones.
4. Autonomously preserve local relay of satellite-derived ISR products.
5. Shift commander traffic to degraded SATCOM fallback.
6. Freeze automated fires cueing during cyber probes against space-fed data.
7. Request space support options after an RPO close-approach overlay.
8. Report "consistent with counterspace-enabled C5ISR pressure, not proof."

## Run

```bash
uv run python scripts/validate_scenarios.py
uv run python scripts/replay.py scenarios/iran_counter_c5isr_brigade.jsonl --dry-run
uv run python scripts/replay.py scenarios/iran_counter_c5isr_brigade.jsonl --dry-run | uv run python services/fusion/orbital_anomaly.py
```

## Demo Language

Use:

```txt
CANOPY is not claiming proof of attribution. It is showing the commander a
confidence-scored assessment that the pattern is consistent with pressure on
space-enabled warfighting functions: GPS/PNT trust, SATCOM reachback,
satellite ISR distribution, overhead warning, cyber access to space-support
workflows, and RPO/counterspace risk.
```
