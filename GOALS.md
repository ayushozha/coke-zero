# coke-zero Goals

This file maps the hackathon work into product goals. Use `CODEX_TASKS.md` for the implementation task list and acceptance criteria.

## Shared Product Goal

**Goal:** Submit coke-zero as an always-on mission watch agent that continuously monitors space-enabled tactical operations, remembers prior runs, retrieves fresh context, and produces commander-ready decisions.

**Primary track:** Always-On Agents.

**Primary sponsors:** Nia and Tensorlake.

**Supporting sponsors:** Vercel for deployment, OpenAI for optional model/API support, Hyperspell for optional organization memory, InsForge/Convex only if the project pivots toward a full-stack/authenticated control plane.

**Done when:** A judge can open a deployed demo, run the `iran_counter_c5isr_brigade` or `army_multidomain_attack_chain` scenario, see live reasoning, see Nia-grounded context, see background/durable-memory behavior, and understand the sponsor usage in under 3 minutes.

## Goal 1: Environment And Sponsor Configuration

**Goal:** Keep all required environment variables documented and keep real secrets out of git.

**Why it matters:** The demo needs sponsor credentials, but submission assets and screenshots must not leak secrets.

**Done when:** `.env.example` lists every required and optional variable, local `.env` exists for runtime use, and `.gitignore` keeps local env files untracked.

**Task file:** `CODEX_TASKS.md`

## Goal 2: Always-On Mission Watch

**Goal:** Make coke-zero look and behave like a background agent, not a manually triggered replay tool.

**Why it matters:** The Always-On track requires autonomous background execution; removing background execution should break the demo story.

**Done when:** A scheduled or repeatable worker can refresh/run a mission watch cycle and emit new reasoning without a human prompt.

**Task file:** `CODEX_TASKS.md`

## Goal 3: Durable Mission Memory

**Goal:** Persist useful mission state across runs.

**Why it matters:** The track requires stateful memory; removing memory should make coke-zero lose baselines, prior dismissals, and previously approved recommendations.

**Done when:** Prior alerts, approvals, denials, watch-window summaries, and context digests survive process restarts or separate invocations.

**Task file:** `CODEX_TASKS.md`

## Goal 4: Nia Context Grounding

**Goal:** Use Nia as the fresh context layer for repo docs, KB entries, scenarios, source notes, and code.

**Why it matters:** Nia is the cleanest sponsor fit for coke-zero because the engine already depends on grounded context and citations.

**Done when:** Attribution and decision traces can show context retrieval from indexed coke-zero sources instead of relying only on static in-process fixtures.

**Task file:** `CODEX_TASKS.md`

## Goal 5: Tensorlake Execution Proof

**Goal:** Use Tensorlake for background execution or sandboxed mission-watch jobs.

**Why it matters:** Tensorlake proves the agent can run while no one is watching and keep execution isolated from the local demo machine.

**Done when:** One mission-watch run can be launched through a Tensorlake-backed path or a clearly documented Tensorlake worker shim with captured logs.

**Task file:** `CODEX_TASKS.md`

## Goal 6: Operator-Ready Decision Loop

**Goal:** Preserve coke-zero's current decision advantage: live traces, tool calls, authority routing, request packets, and operator approval.

**Why it matters:** This is the strongest product proof already present in the repo.

**Done when:** The Brigade and Operator views show signals, anomalies, attribution, tool use, recommendations, and approval state clearly during the primary demo.

**Task file:** `CODEX_TASKS.md`

## Goal 7: Deployed Submission

**Goal:** Produce a real deployed demo link, repo URL, and concise submission story before the 6:00 PM deadline.

**Why it matters:** The hackathon rules state that localhost is not a valid demo link.

**Done when:** The frontend and backend/demo path are reachable from a judge machine, README/submission notes explain the track and sponsors, and no secrets appear in public files.

**Task file:** `CODEX_TASKS.md`

## Goal 8: Optional Sponsor Extensions

**Goal:** Keep Hyperspell, InsForge, Convex, OpenAI, and GitHub integration paths scoped as optional upgrades.

**Why it matters:** These sponsors can strengthen the pitch, but the core demo should not depend on unfinished integrations.

**Done when:** Each optional sponsor has a documented role, env variables, acceptance criteria, and a clear go/no-go rule.

**Task file:** `CODEX_TASKS.md`
