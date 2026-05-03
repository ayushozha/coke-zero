# CANOPY

**Sense · Attribute · Decide.**

> *"We must defend U.S. space capabilities, and we must protect our forces from space-enabled attack."*
> — CSO Gen. B. Chance Saltzman, *Space Warfighting*, March 2025

Space supports **every** fight. CANOPY lets the fight support space.

CANOPY is a tactical multi-domain awareness and decision-support system for the brigade-level operator. It fuses orbital, RF/EW, cyber, PNT, SATCOM, drone, HUMINT, and OSINT signals into a single live picture, attributes the threat, recommends an authorized response, and visualizes the outcome — all on hardware that fits in a forward operating base.

- Runs at the **edge** on a single NVIDIA RTX 3090.
- **Sense to decide in under 20 seconds.**
- 100% local LLM inference via Ollama — no cloud, no PII egress.

---

## Architecture

CANOPY is a three-stage agentic pipeline. Each stage publishes typed events to an in-process bus; the FastAPI gateway fans them out to the browser over a single WebSocket.

| Stage | What it does | Output |
|---|---|---|
| **Sense** | Normalizes heterogeneous feeds (RF, orbital, cyber, PNT, SATCOM, drone, OSINT) into a canonical `Signal`. Fuses signals into `Anomaly` clusters via temporal + spatial + semantic correlation. | `Signal`, `Anomaly` |
| **Attribute** | Multi-agent reasoning: a primary LLM call attributes the anomaly, a red-team call challenges it, and a reconciler produces a calibrated final `Attribution` with confidence. | `Attribution`, `AttributionChallenge` |
| **Decide** | Tool-using LLM agent calls real tools (`kb.lookup`, `orbit.compute_close_approach` (Skyfield SGP4), `orbit.simulate_maneuver` (Clohessy-Wiltshire), `request.draft`, `routing.validate`) to produce an actionable `Decision` with authority routing. | `Decision`, `RequestPacket` |

Every reasoning step emits a `ReasoningTrace` event so the operator sees *why* — not just *what* — on a live terminal-style panel.

The frontend is a React + Cesium + MapLibre console with two views:
- **Brigade COP** — multi-domain fusion picture, OSINT clustering, scenario timeline, reasoning trace, and approval banner.
- **Operator Console** — review surface where the operator accepts or denies the decide-stage recommendation. Accept triggers an interactive Cesium animation showing the maneuver against the live N2YO satellite catalog (plane-change burn, kinetic-strike Bezier, or link-interdiction beam, depending on the action).

---

## Where the data comes from

| Source | Domain | Notes |
|---|---|---|
| **N2YO TLE cache** ([`public/orbital/`](public/orbital/), [`data/tle_cache.json`](data/tle_cache.json)) | orbit / SDA | Real two-line elements for AEHF, MUOS, WGS, SBIRS, GSSAP, GPS-3 (US) and Yaogan / Cosmos (CHN/RUS). Skyfield-backed SGP4 propagation produces real close-approach geometry. |
| **OSINT corpus** | open-source | Sentence-transformer (`all-MiniLM-L6-v2`, 384-dim) embeddings, cosine-clustered at 0.40, PCA-projected to 2D for the embedding panel. |
| **Hand-authored scenarios** ([`scenarios/*.jsonl`](scenarios/)) | RF/EW, cyber, PNT, SATCOM, drone, HUMINT | 11 deterministic JSONL beats covering CENTCOM, Army, and regional vignettes. |
| **Procedural variants** ([`bench/scenarios/`](bench/)) | synthetic | ~40 perturbations of the 11 seeds (miss distance, lead time, signal mix) for the benchmark harness. |
| **KB** ([`kb/`](kb/), [`data/kb_seed_entries.json`](data/kb_seed_entries.json)) | tradecraft | Actor capabilities, doctrine references, and routing rules used by `kb.lookup`. |

Every record — real, mock, or synthetic — flows through the same canonical `Signal` schema.

---

## Running locally

### Prerequisites

- Python ≥ 3.11 with [`uv`](https://github.com/astral-sh/uv).
- Node ≥ 20.
- [Ollama](https://ollama.com) running locally with **Gemma 3n E2B** pulled.
- One NVIDIA RTX 3090 (or any GPU with ~12 GB VRAM) for sub-20s inference.

### Start the local LLM

```bash
ollama pull gemma3n:e2b
ollama serve
```

CANOPY reads `CANOPY_OLLAMA_URL` (default `http://localhost:11434`) and `CANOPY_OLLAMA_MODEL` (set this to `gemma3n:e2b`).

### Backend gateway

```bash
./run uvicorn halo.api:app --host 0.0.0.0 --port 8000
```

The gateway boots the in-process bus, the three services, and exposes:
- `GET /kb`, `GET /scenarios`, `POST /scenarios/{id}/start`, `POST /stress`
- `WS /ws` — Signal / Anomaly / Attribution / Decision / UIEvent / ReasoningTrace fanout

### Frontend

```bash
npm install
npm run dev   # http://localhost:5173
```

Set `VITE_CANOPY_API_URL=http://localhost:8000` in `.env.local` if the gateway runs on a different host.

### One-shot verification

```bash
./run python scripts/verify.py scenarios/army_multidomain_attack_chain.jsonl
```

Replays a scenario through the engine in-process, asserts the expected sense → attribute → decide chain, and prints the reasoning trace.

### Benchmark

```bash
./run python -m bench.run
```

Runs the 51-scenario harness (11 seeds + ~40 procedural variants) and writes a scorecard with attribution accuracy, calibration, and p50/p95 latency.

### Stress mode

The operator panel can simulate domain loss:

```bash
curl -X POST http://localhost:8000/stress \
  -H "Content-Type: application/json" \
  -d '{"blocked_domains": ["pnt", "satcom"]}'
```

The reasoning panel will surface `[stress] PNT data unavailable, lowering confidence` in real time and the engine will route to `threat_warning` when correlations are starved.

---

## Why local-first

| Constraint | CANOPY's answer |
|---|---|
| No reliable backhaul at the edge | Full pipeline runs on a single GPU; no API calls leave the box. |
| Adversarial denial of comms | Stress-mode degrades gracefully; reasoning panel narrates the loss. |
| Sensitive sensor data | Nothing is sent to a hyperscaler — Ollama hosts the model in-process. |
| Time-critical decisions | <20 s sense-to-decide on Gemma 3n E2B. |

---

## Repo layout

```
halo/                  # Python engine (services, schemas, API gateway)
  api/                 # FastAPI gateway + WebSocket fanout
  services/            # fusion, attrib (multi-agent), decide (tool-using), llm, orbit, kb, traces
src/                   # React + Cesium + MapLibre console
  components/          # Brigade COP + Operator Console + reasoning panel + maneuver demo
  lib/n2yoSatelliteLayer.ts  # SGP4-driven orbital animation
scenarios/             # 11 hand-authored JSONL beats
bench/                 # benchmark harness + scorecard
data/                  # KB seeds, source registry, orbital cache metadata
public/orbital/        # N2YO position caches per NORAD ID
kb/                    # capability + routing knowledge base
```

---

## Acknowledgements

Built for the U.S. Army xTech 3rd Annual National Security Hackathon. Skyfield for SGP4 propagation, sentence-transformers for OSINT embeddings, Cesium for the globe, MapLibre for the AOR map, Ollama + Gemma 3n for the brain at the edge.
