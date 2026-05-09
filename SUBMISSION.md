# coke-zero Submission

## Links

- Demo: https://coke-zero-drab.vercel.app
- Demo health check: https://coke-zero-drab.vercel.app/demo/health.json
- Repository: https://github.com/ayushozha/coke-zero

## Track

Always-On Agents.

coke-zero is an always-on mission watch agent for space-enabled tactical operations. It monitors multi-domain signals, correlates anomalies, retrieves grounded context, remembers operator dispositions, and routes commander-ready decisions.

## Team

- Team name: coke-zero
- Members: fill in final submitted team roster

## Sponsor Usage

- Nia: context grounding over repo docs, KB entries, scenarios, source notes, and code. The reasoning trace shows Nia retrieval before attribution and decision support.
- Tensorlake: background execution proof through the mission-watch worker shim and captured run evidence in `docs/tensorlake_execution_proof.md`.
- Vercel: deployed judge-facing frontend with a static demo feed, plus optional live backend attachment through `VITE_COKE_ZERO_PUBLIC_API_URL` and `VITE_COKE_ZERO_PUBLIC_WS_URL`.
- OpenAI, Hyperspell, InsForge, Convex, and GitHub: documented optional extensions; none are required for the primary demo path.

## Judge Demo Path

1. Open the deployed demo link.
2. Wait 15 to 25 seconds for the static deployment feed to replay the autonomous mission watch path.
3. Verify the Brigade COP shows scenario signals, map activity, reasoning traces, tool calls, and a request-authority approval banner.
4. Open `/operator` and review the anomaly queue, decision rail, action log, embeddings, and reasoning panel.
5. Approve or deny the recommendation to show the operator decision loop.

## What Is Deployed

The Vercel deployment is a production React/Vite frontend. It does not require a public FastAPI process for judging. If no public WebSocket is configured, the app runs a checked-in static demo feed that mirrors the backend event contract: signals, anomaly, attribution, decision, UI event, tool traces, memory trace, watch trace, and embedding snapshot.

The live backend path remains available locally or through any reachable host:

```bash
uv run uvicorn coke_zero.api:app --host 0.0.0.0 --port 8000
```

Then set:

```bash
VITE_COKE_ZERO_PUBLIC_API_URL=https://your-api-host
VITE_COKE_ZERO_PUBLIC_WS_URL=wss://your-api-host/ws
```

## 3-Minute Story

coke-zero solves the gap between space-enabled attacks and brigade-level response. The agent continuously watches operational signals, fuses cross-domain evidence, grounds the attribution in Nia-indexed context, and uses a Tensorlake-compatible background worker path to prove it can run without a human prompt. The commander sees a clear request-authority packet instead of raw telemetry, and the operator can approve or deny the recommendation while preserving the decision history.

The deployed demo is intentionally resilient for judging: it uses checked-in scenario fixtures and the same frontend event contract when a public backend is not attached, so judges do not need localhost access or secret credentials.

## Limitations

- The deployed Vercel demo uses static fixture replay unless a public backend URL is configured.
- Tensorlake cloud execution requires `TENSORLAKE_API_KEY`; the repo includes a documented local-shim fallback.
- Live CelesTrak/N2YO refreshes are optional; checked-in orbital fixtures keep the demo reliable.
