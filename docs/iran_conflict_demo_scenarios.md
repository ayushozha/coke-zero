# Iran Conflict Demo Scenarios

These feeds translate public reporting on the 2026 Iran crisis into
schema-valid CANOPY demo data. The records are fictionalized for the hackathon:
they are not operational guidance, target lists, or real intelligence.

The goal is to show what CANOPY would do for an Army or joint tactical user at
a specific time when public-source-relevant events happen.

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
timeline hits and a theater sustainment convoy is about to move?

Demo answer:

1. Start a sustainment risk clock from the public blockade time.
2. Detect traffic collapse around Hormuz.
3. Flag GNSS interference on the convoy corridor.
4. Hold convoy departure after shared GPS bias appears.
5. Preserve UAS overwatch by switching relay from a spoofed drone.
6. Freeze dispatch changes during credential probes.
7. Move command traffic to low-bandwidth fallback.
8. Recommend a 20-minute hold while degraded-mode navigation and comms are
   confirmed.

### `scenarios/iran_proxy_uas_base_defense.jsonl`

Question: what would CANOPY do at 0130Z when a base in Iraq sees proxy UAS
warning signs?

Demo answer:

1. Load public militia/UAS risk context.
2. Detect control-link bursts.
3. Detect two inbound low-altitude UAS tracks.
4. Notice PNT degradation affecting perimeter sensors.
5. Shift coordination from SATCOM to local radio fallback.
6. Lock alerting systems during cyber probes.
7. Confirm defensive posture and personnel warning.
8. Emit a confidence-scored base-defense assessment without overclaiming
   attribution.

### `scenarios/iran_counter_c5isr_brigade.jsonl`

Question: what would CANOPY do when a brigade's drone mesh, SATCOM, cyber
systems, and space support all degrade inside the same short window?

Demo answer:

1. Preload Iran missile/UAS and counterspace context from public sources.
2. Detect drone-link EW.
3. Detect GNSS spoofing across multiple drones.
4. Autonomously preserve ISR through relay handoff.
5. Shift commander traffic to degraded SATCOM fallback.
6. Freeze automated fires cueing during cyber probes.
7. Request space support options after an RPO close-approach overlay.
8. Report "consistent with counter-C5ISR pressure, not proof."

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
confidence-scored assessment that the pattern is consistent with known Iranian
and Iran-backed modes of pressure: drones, missiles, PNT disruption, cyber
probing, SATCOM degradation, and space-risk indicators.
```
