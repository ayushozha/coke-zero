from __future__ import annotations

import json
from pathlib import Path

import pytest

from coke_zero.services.scenario_replay import load_scenario_signals
from coke_zero.services.tensorlake_watch import (
    TensorlakeMissionWatchConfig,
    TensorlakeSetupError,
    run_tensorlake_mission_watch_sync,
)

ROOT = Path(__file__).resolve().parent.parent
SCENARIO = ROOT / "scenarios" / "beat2.jsonl"


def test_tensorlake_worker_requires_api_key_without_local_shim(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("TENSORLAKE_API_KEY", "")

    with pytest.raises(TensorlakeSetupError, match="TENSORLAKE_API_KEY"):
        run_tensorlake_mission_watch_sync(
            TensorlakeMissionWatchConfig(
                scenarios=(SCENARIO,),
                output_dir=tmp_path,
                local_shim=False,
                load_env_file=False,
            )
        )


def test_tensorlake_local_shim_writes_captured_evidence(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("TENSORLAKE_API_KEY", "")

    evidence = run_tensorlake_mission_watch_sync(
        TensorlakeMissionWatchConfig(
            scenarios=(SCENARIO,),
            output_dir=tmp_path,
            scenario_speed=1000.0,
            scenario_max_delay_s=0.0,
            drain_s=0.2,
            attrib_window_s=0.1,
            local_shim=True,
            load_env_file=False,
            run_id="tlw-test",
        )
    )

    assert evidence.status == "ok"
    assert evidence.backend == "local-worker-shim"
    assert evidence.run_id == "tlw-test"
    assert evidence.watch_result is not None
    assert evidence.watch_result.signals_published == len(load_scenario_signals(SCENARIO))
    assert evidence.summary_path.exists()
    assert evidence.events_path.exists()

    summary = json.loads(evidence.summary_path.read_text(encoding="utf-8"))
    assert summary["run_id"] == "tlw-test"
    assert summary["api_key_present"] is False
    assert summary["api_key_value"] is None
    assert summary["watch"]["run_id"] == "tlw-test"
    assert summary["event_counts"]["signal"] == len(load_scenario_signals(SCENARIO))
    assert summary["event_counts"]["trace"] >= 1
    assert summary["tensorlake"]["application_entrypoint"] == (
        "coke_zero.tensorlake_app:mission_watch_job"
    )

    events = [
        json.loads(line)
        for line in evidence.events_path.read_text(encoding="utf-8").splitlines()
    ]
    assert any(event["record_type"] == "job_started" for event in events)
    assert any(
        event["record_type"] == "bus_event"
        and event["kind"] == "trace"
        and event["data"]["stage"] == "watch"
        and event["data"]["payload"]["autonomous"] is True
        for event in events
    )
