# Army Demo Scenarios

These scenario feeds are optional demo lanes built on the same canonical
`Signal` schema as the main coke-zero beats. They are meant to feel Army-relevant:
small UAS, contested spectrum, PNT attacks, tactical SATCOM degradation, and
space-enabled collection risk.

## Recommended Judge Demo

Use `scenarios/army_multidomain_attack_chain.jsonl` as the main story.

It shows coke-zero moving from raw events to operational meaning:

1. RPO screening alert near a friendly LEO support asset.
2. RF interference against drone links.
3. GNSS spoofing across multiple drones.
4. Autonomous relay handoff keeps ISR alive.
5. Cyber probes hit the telemetry gateway.
6. SATCOM degrades.
7. RPO close approach escalates the space risk.
8. coke-zero emits a confidence-scored multi-domain assessment.

The key line for the pitch:

```txt
Consistent with coordinated counter-C5ISR pressure, not proof of a single actor.
```

## Scenario Files

- `scenarios/army_drone_fdir.jsonl`
  - Focus: drone fault detection, isolation, and recovery under PNT/RF attack.
  - Demo value: shows coke-zero preserving ISR after a drone navigation fault.

- `scenarios/army_relay_reconfig.jsonl`
  - Focus: autonomous drone relay switching under SATCOM degradation and terrain masking.
  - Demo value: shows the network adapting without waiting for a human to debug links.

- `scenarios/army_satellite_collection_risk.jsonl`
  - Focus: overhead ISR collection risk against brigade movement and logistics.
  - Demo value: makes space awareness directly useful to a brigade commander.

- `scenarios/army_multidomain_attack_chain.jsonl`
  - Focus: RF, PNT, drone, cyber, SATCOM, and orbital events fused into one campaign assessment.
  - Demo value: best final runthrough for judges.

## Run

Validate every scenario:

```bash
uv run python scripts/validate_scenarios.py
```

Replay one scenario:

```bash
uv run python scripts/replay.py scenarios/army_multidomain_attack_chain.jsonl --dry-run
```

Smoke test the orbital anomaly detector:

```bash
uv run python scripts/replay.py scenarios/army_multidomain_attack_chain.jsonl --dry-run | uv run python services/fusion/orbital_anomaly.py
```

## Frontend Summary Targets

The frontend should be able to show these short cards:

- `Drone FDIR`: spoofed navigation isolated, ISR continues with reduced confidence.
- `Relay Reconfig`: DRONE-06 or DRONE-08 becomes primary relay to preserve observer feed.
- `Satellite Collection Risk`: overhead pass and tasking cue trigger emission reduction.
- `Attack Chain`: coordinated counter-C5ISR pressure assessment with recommended actions.
