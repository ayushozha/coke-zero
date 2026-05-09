# coke-zero Feature And Task List

Codex owns implementation planning, sponsor integration plumbing, verification, and submission assets. Each feature below includes a goal, tasks, and acceptance criteria.

## Feature 1: Environment And Secret Hygiene

**Goal:** Add the referenced hackathon env configuration to coke-zero without exposing secrets.

**Context:** The sibling `Nozomio Hackathon` project has sponsor variables for Tensorlake, Convex, Hyperspell, InsForge, GitHub, OpenAI, and the app identity. coke-zero already has model/frontend env variables.

**Tasks:**
- Create a local `.env` for coke-zero from the referenced `.env` values.
- Expand `.env.example` with sponsor variables and safe placeholders.
- Keep `.env`, `.env.local`, and other local env files ignored.
- Document which variables are required for the primary demo and which are optional.

**Acceptance criteria:**
- `.env.example` includes `NOZOMIO_APP_NAME`, `JWT_SECRET`, `OPENAI_API_KEY`, `OPENAI_TRIAGE_MODEL`, `TENSORLAKE_API_KEY`, `HYPERSPELL_API_KEY`, `INSFORGE_API_URL`, `INSFORGE_API_KEY`, `CONVEX_DEPLOYMENT`, `CONVEX_ACCESS_TOKEN`, `NEXT_PUBLIC_CONVEX_URL`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET`.
- Existing coke-zero variables remain documented.
- Local `.env` is present for runtime use but remains gitignored.
- No secret values are printed in docs, tests, or final submission assets.

## Feature 2: Primary Track Positioning

**Goal:** Position coke-zero for the Always-On Agents track.

**Context:** coke-zero already fuses live-like operational signals, attributes threats, and recommends actions. The missing track proof is autonomous background execution plus durable memory.

**Tasks:**
- Update submission copy to describe coke-zero as an always-on mission watch agent.
- Define the failure test: removing background execution or durable memory breaks the demo.
- Pick one primary demo scenario and one backup scenario.
- Prepare a 3-minute script that shows autonomous watch, memory, context retrieval, and operator decision.

**Acceptance criteria:**
- Primary track is documented as Always-On Agents.
- Nia and Tensorlake are named as primary sponsors.
- `iran_counter_c5isr_brigade.jsonl` or `army_multidomain_attack_chain.jsonl` is the primary demo.
- The script explains why the project is not just a dashboard or manual replay.

## Feature 3: Always-On Mission Watch Worker

**Goal:** Add a repeatable background watch loop for mission scenarios and live feed refreshes.

**Context:** The API already supports scenario replay and signal ingestion. The track needs unattended wakeups that publish new state without a direct user prompt.

**Tasks:**
- Add a worker command or script that runs a watch cycle on a schedule.
- Support inputs from scenario replay, CelesTrak/N2YO refresh, or seeded signal batches.
- Emit traces that identify the run as autonomous/background execution.
- Add a simple run id so outputs can be associated with a watch cycle.

**Acceptance criteria:**
- A watch cycle can run without clicking the UI.
- The API/WebSocket receives signals, anomalies, attribution, decisions, and UI events from the watch run.
- The reasoning panel shows that the cycle was autonomous.
- A failed watch cycle reports a clear error without corrupting current UI state.

**Implementation status:** Done. `MissionWatchService` runs repeatable autonomous cycles with watch run IDs, API autostart/status/run controls, CLI `--watch`, `[watch]` reasoning traces, and failure traces that avoid partial signal publication when scenario validation fails.

## Feature 4: Durable Mission Memory

**Goal:** Persist mission memory across process restarts and repeated watch cycles.

**Context:** coke-zero currently keeps most runtime state in memory or session storage. The track needs durable memory that changes future behavior.

**Tasks:**
- Define a small mission-memory schema for prior alerts, approvals, denials, risk baselines, context digests, and source timestamps.
- Add a JSON or SQLite-backed local memory store as the minimum viable path.
- Load memory at engine startup and update it after decisions/UI events.
- Record operator approvals, denials, and dismissed recommendations through the backend so they are not browser-session-only.
- Hydrate the frontend from durable memory so repeated recommendations can be suppressed or marked with prior disposition.
- Surface memory hits in the reasoning trace.

**Acceptance criteria:**
- Prior approved or dismissed recommendations survive an engine restart.
- A repeated scenario can reference the prior run in a trace line.
- Memory can be reset for demo rehearsal.
- `GET /memory`, `POST /memory/operator-action`, and `POST /memory/reset` work against the same durable store.
- If the memory file is missing or invalid, coke-zero starts with a clear warning and recreates safe defaults.

## Feature 5: Nia Context Grounding

**Goal:** Add Nia as a context source for attribution and decision support.

**Context:** coke-zero already has `kb.lookup`; Nia should extend this to repo docs, source notes, code, scenarios, and public-source references.

**Tasks:**
- Index `README.md`, `docs/`, `kb/`, `data/kb_seed_entries.json`, `scenarios/`, and relevant code with Nia.
- Add a Nia context helper or tool adapter.
- Use Nia context in attribution/decision prompts when available.
- Fall back to the local KB when Nia is unavailable.

**Acceptance criteria:**
- A trace line shows Nia context retrieval during the primary demo.
- Retrieved context includes source labels or citations.
- The engine continues to work if Nia credentials or service access are unavailable.
- The README/submission explains exactly what Nia is grounding.

## Feature 6: Tensorlake Background Execution

**Goal:** Use Tensorlake for the always-on execution proof.

**Context:** Tensorlake is the sponsor fit for scheduled, stateful, isolated agent execution.

**Tasks:**
- Add a Tensorlake worker shim or integration script using `TENSORLAKE_API_KEY`.
- Run a mission-watch job that calls coke-zero replay/ingest or executes the watch loop in a sandbox.
- Capture logs, run id, start time, completion status, and output summary.
- Surface Tensorlake execution evidence in the demo UI or submission notes.

**Acceptance criteria:**
- Missing `TENSORLAKE_API_KEY` produces a clear setup error or documented fallback.
- One background job produces captured evidence.
- The job can be rerun without manual cleanup.
- Submission materials state what ran on Tensorlake and what remained local.

**Implementation status:** Done. `coke_zero.tensorlake_app:mission_watch_job` is a Tensorlake application shim for the mission-watch worker, `scripts/tensorlake_mission_watch.py` launches the same path with a clear missing-key error or `--local-shim` fallback, and each run writes `dist/tensorlake/<run_id>/events.jsonl` plus `summary.json` with run id, timestamps, status, event counts, and autonomous watch traces. See `docs/tensorlake_execution_proof.md`.

## Feature 7: Goal 6 - Operator-Ready Decision Loop

**Goal:** Preserve coke-zero's current decision advantage: live traces, tool calls, authority routing, request packets, and operator approval.

**Why it matters:** This is the strongest product proof already present in the repo.

**Context:** coke-zero's strongest existing feature is a typed pipeline from signal to recommendation with authority routing.

**Tasks:**
- Verify the Brigade view displays scenario, map, status cards, event feed, reasoning trace, request packet details, and approval banner.
- Verify the Operator view displays signals, anomaly queue, attribution, decision rail, tool calls, recommendations, request packet details, embeddings, and reasoning.
- Ensure request-authority decisions include request packet details and approval state.
- Keep stress mode available for degraded-domain demonstration.

**Acceptance criteria:**
- Primary demo produces at least one `recommendation_created` UI event.
- Operator can approve or dismiss a recommendation.
- Reasoning trace shows fusion, attribution, red-team/reconcile, decision, and tool stages.
- Stress mode lowering confidence is visible when a domain is blocked.

**Implementation status:** Done. Brigade now has a live decision-loop summary with signal/anomaly/tool/recommendation counts, request packet details, source chain, and approval state. Operator now prioritizes request-authority decisions, shows attribution and recommendations alongside the anomaly queue, surfaces request packets in the top loop and decision rail, and persists approved/denied/dismissed state through the operator action path.

## Feature 8: Scenario And Demo Fixtures

**Goal:** Keep the demo reliable even when live integrations are slow.

**Context:** Judging time is short. The system needs a seeded path that proves behavior without depending on external latency.

**Tasks:**
- Select primary and backup scenarios.
- Keep fixture mode working for UI fallback.
- Add demo reset instructions.
- Run scenario validation before submission.

**Acceptance criteria:**
- `uv run python scripts/validate_scenarios.py` passes.
- `uv run python scripts/verify.py scenarios/army_multidomain_attack_chain.jsonl` or the chosen primary scenario passes.
- Fixture mode still renders meaningful UI events if the backend is offline.
- Demo can be reset in under 30 seconds.

## Feature 9: Vercel Deployment

**Goal:** Provide a deployed demo link that is not localhost.

**Context:** The hackathon rules require a deployed demo link. Vercel is the fastest fit for the React frontend.

**Tasks:**
- Build the frontend with production env values.
- Deploy the frontend to Vercel.
- Decide whether backend runs as a reachable service, tunnel, or demo-mode fixture.
- Document the deployed URL and any limitations.

**Acceptance criteria:**
- A judge can open the demo link from another machine.
- The deployed app loads without console-breaking errors.
- The demo path either connects to a live backend or clearly runs from seeded fixture mode.
- No secret env values are embedded in the client bundle.

**Implementation status:** Done. Production deployment is
https://coke-zero-drab.vercel.app with a public static demo health path at
https://coke-zero-drab.vercel.app/demo/health.json. The Vercel build outputs to
`dist-web`, excludes local env files through `.vercelignore`, and production
runtime config only reads deploy-specific public backend variables. Browser
smoke verified `/` and `/operator` with no console errors.

## Feature 10: Optional Hyperspell Memory

**Goal:** Keep Hyperspell as an optional company-brain or organization-memory upgrade.

**Context:** Hyperspell fits if coke-zero needs cross-source team memory, but it should not block the Always-On demo.

**Tasks:**
- Define what coke-zero would store in Hyperspell: operator notes, approved actions, watch summaries, and source digests.
- Add a server-only helper guarded by `HYPERSPELL_API_KEY` if time permits.
- Add submission language that distinguishes core memory from optional Hyperspell memory.

**Acceptance criteria:**
- Missing `HYPERSPELL_API_KEY` does not break the primary demo.
- If implemented, one memory add/search call succeeds server-side.
- UI or docs explain Hyperspell's optional role without overclaiming.

## Feature 11: Optional InsForge And Convex Full-Stack Path

**Goal:** Keep a credible pivot path for the Ship It track without distracting from the primary track.

**Context:** InsForge and Convex are useful if coke-zero becomes an authenticated, deployed control plane with persistent users and run history.

**Tasks:**
- Document InsForge as auth/backend/model-gateway option.
- Document Convex as realtime product-state option.
- Avoid duplicating the current FastAPI event bus unless the project pivots.
- Keep env variables ready.

**Acceptance criteria:**
- InsForge and Convex roles are documented.
- The current coke-zero pipeline remains the source of truth for demo behavior.
- No partial auth/backend rewrite blocks the primary demo.
- Go/no-go rule is explicit: use only after Always-On proof is complete.

## Feature 12: Optional GitHub And OpenAI Support

**Goal:** Use GitHub and OpenAI only where they strengthen the demo.

**Context:** GitHub can provide repo context for Nia/Codex-style engineering claims. OpenAI can support optional model calls or triage experiments.

**Tasks:**
- Keep GitHub OAuth/API variables documented.
- Keep OpenAI model variables documented.
- Avoid requiring either service for the primary operational scenario.
- Use them only for submission polish or optional engineering-agent side demos.

**Acceptance criteria:**
- Missing GitHub credentials do not break coke-zero.
- Missing OpenAI credentials do not break coke-zero's existing stub/Ollama/Anthropic paths.
- Any use of OpenAI or GitHub is documented as optional support.

## Feature 13: Submission Assets

**Goal:** Prepare the materials needed for final submission.

**Context:** The project must be submitted before 6:00 PM with a demo link, GitHub URL, and team details.

**Tasks:**
- Update README or add submission notes with product pitch, track, sponsors, architecture, demo flow, and limitations.
- Capture screenshots or a short demo recording.
- Write the 3-minute in-person judging script.
- Verify no screenshots, docs, or logs contain secrets.

**Acceptance criteria:**
- Submission notes include deployed demo link, GitHub repo URL, chosen track, sponsor usage, and team member details placeholder.
- The pitch can be delivered in under 3 minutes.
- Known limitations are honest and concise.
- Secret scan of changed docs/env templates shows no real credentials.

**Implementation status:** Done. `SUBMISSION.md` contains the deployed demo URL,
repo URL, Always-On Agents track story, sponsor usage, judge demo path,
limitations, and a concise 3-minute narrative.

## Feature 14: Verification

**Goal:** Keep the repo shippable while adding sponsor proof.

**Context:** The final hour should be demo rehearsal, not avoidable build/test repair.

**Tasks:**
- Run Python tests relevant to pipeline and API changes.
- Run frontend build after UI changes.
- Run scenario validation and at least one primary scenario verification.
- Do a final browser smoke test if the dev server is started.

**Acceptance criteria:**
- `uv run pytest` or a scoped relevant test set passes.
- `npm run build` passes after frontend changes.
- Scenario validation passes.
- Any skipped verification is documented with the reason.
