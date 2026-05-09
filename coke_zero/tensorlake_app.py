from __future__ import annotations

from pathlib import Path
from typing import Any

from coke_zero.services.tensorlake_watch import (
    TensorlakeMissionWatchConfig,
    run_tensorlake_mission_watch_sync,
)


def _mission_watch_job_impl(
    scenarios: list[str] | None = None,
    scenario_speed: float = 200.0,
    scenario_max_delay_s: float | None = 0.05,
    drain_s: float = 4.0,
    provider: str = "stub",
    output_dir: str = "dist/tensorlake",
) -> dict[str, Any]:
    evidence = run_tensorlake_mission_watch_sync(
        TensorlakeMissionWatchConfig(
            scenarios=tuple(Path(s) for s in (scenarios or [
                "scenarios/army_multidomain_attack_chain.jsonl"
            ])),
            output_dir=output_dir,
            provider=provider,
            scenario_speed=scenario_speed,
            scenario_max_delay_s=scenario_max_delay_s,
            drain_s=drain_s,
            local_shim=False,
        )
    )
    return evidence.to_json()


try:
    from tensorlake.applications import application, function
except Exception:
    mission_watch_job = _mission_watch_job_impl
else:

    @application()
    @function(timeout=1800, secrets=["TENSORLAKE_API_KEY"])
    def mission_watch_job(
        scenarios: list[str] | None = None,
        scenario_speed: float = 200.0,
        scenario_max_delay_s: float | None = 0.05,
        drain_s: float = 4.0,
        provider: str = "stub",
        output_dir: str = "dist/tensorlake",
    ) -> dict[str, Any]:
        """Tensorlake application entrypoint for one mission-watch cycle."""

        return _mission_watch_job_impl(
            scenarios=scenarios,
            scenario_speed=scenario_speed,
            scenario_max_delay_s=scenario_max_delay_s,
            drain_s=drain_s,
            provider=provider,
            output_dir=output_dir,
        )
