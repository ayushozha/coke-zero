# Tensorlake Execution Proof

Goal 5 proves that coke-zero's always-on mission watch can run outside the
browser and capture evidence while nobody is operating the demo UI.

## What Tensorlake Runs

The Tensorlake application entrypoint is:

```text
coke_zero.tensorlake_app:mission_watch_job
```

When the Tensorlake SDK is installed, that function is decorated with
`@application()` and `@function(timeout=1800, secrets=["TENSORLAKE_API_KEY"])`.
This follows Tensorlake's documented model for deploying Python functions as
serverless applications and running them in isolated containers:

- [Applications quickstart](https://docs.tensorlake.ai/applications/quickstart)
- [Programming agents](https://docs.tensorlake.ai/applications/overview)

The worker calls the same internal evidence runner used by the local shim:

```text
coke_zero.services.tensorlake_watch.run_tensorlake_mission_watch
```

That runner builds an isolated coke-zero engine, starts the fusion, attribution,
decision, and UI-event services, runs one `MissionWatchService` cycle, drains
downstream events, and writes evidence artifacts.

## Cloud Path

With Tensorlake configured:

```powershell
$env:TENSORLAKE_API_KEY="<redacted>"
tl deploy coke_zero/tensorlake_app.py
curl https://api.tensorlake.ai/applications/mission_watch_job `
  -H "Authorization: Bearer $env:TENSORLAKE_API_KEY" `
  --json '{"scenarios":["scenarios/army_multidomain_attack_chain.jsonl"],"scenario_speed":200,"scenario_max_delay_s":0.05}'
```

Tensorlake returns a request id. Poll the request and output endpoints from the
Tensorlake dashboard or API to inspect status and logs. The output is the same
summary JSON written by the local shim.

## Local Worker-Shim Proof

When the Tensorlake key or cloud deploy is not available on the demo machine,
run the documented shim. This uses the same worker code and artifact format,
but records `backend=local-worker-shim` and `api_key_present=false`.
The `--ignore-dotenv` flag keeps local secret files out of the proof run.

```powershell
uv run python scripts/tensorlake_mission_watch.py `
  --local-shim `
  --ignore-dotenv `
  --scenario scenarios/army_multidomain_attack_chain.jsonl `
  --scenario-speed 200 `
  --scenario-max-delay-s 0.05 `
  --drain-s 4
```

Artifacts are written under:

```text
dist/tensorlake/<run_id>/
  events.jsonl
  summary.json
```

`events.jsonl` captures the job lifecycle and bus events for signals, anomalies,
attributions, decisions, UI events, and reasoning traces. `summary.json` records
the run id, start and completion times, scenario names, event counts, mission
watch status, and artifact paths. Secret values are never written; the summary
only records whether `TENSORLAKE_API_KEY` was present.

## Acceptance Evidence

A valid proof run has:

- `summary.status == "ok"`
- `summary.watch.status == "ok"`
- `summary.watch.run_id` matching the Tensorlake/shim run id
- `summary.watch.signals_published > 0`
- at least one captured `traces.watch` record with
  `payload.autonomous == true`
- no secret values in either artifact

This proves the always-on agent path can be launched as a background worker,
rerun without cleanup, and inspected after completion.
