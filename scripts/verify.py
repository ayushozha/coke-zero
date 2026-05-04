"""End-to-end smoke for the CANOPY engine.

Replays scenarios through the full pipeline (fusion -> attribution -> decision
-> UIEvent) using either the stub LLM or live Claude. Exits 0 on success, 1
with diagnostics on failure.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv  # noqa: E402

from canopy.services.attrib import AttribService  # noqa: E402
from canopy.services.bus import InProcessBus  # noqa: E402
from canopy.services.decide import DecideService  # noqa: E402
from canopy.services.fusion import FusionService  # noqa: E402
from canopy.services.kb import KB  # noqa: E402
from canopy.services.llm import LLMClient  # noqa: E402
from canopy.services.orbit import OrbitService  # noqa: E402
from canopy.services.scenario_replay import ScenarioReplayService  # noqa: E402
from canopy.services.schemas.events import (  # noqa: E402
    Anomaly,
    Attribution,
    Decision,
    UIEvent,
)
from canopy.services.ui_events import UIEventService  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SCENARIOS = [
    ROOT / "scenarios" / "beat1.jsonl",
    ROOT / "scenarios" / "beat2.jsonl",
    ROOT / "scenarios" / "beat4.jsonl",
    ROOT / "scenarios" / "beat47.jsonl",
]
TIMEOUT_STUB_S = 10.0
TIMEOUT_LIVE_S = 180.0
DRAIN_STUB_S = 1.0
DRAIN_LIVE_S = 45.0
RECOMMENDATION_SCENARIOS = {
    "beat47.jsonl",
    "army_multidomain_attack_chain.jsonl",
    "army_relay_reconfig.jsonl",
    "iran_counter_c5isr_brigade.jsonl",
    "iran_hormuz_convoy_resilience.jsonl",
    "iran_proxy_uas_base_defense.jsonl",
}


LLM_PROVIDERS = ("stub", "anthropic", "ollama")


def _build_llm(*, provider: str, kb: KB) -> LLMClient:
    if provider == "anthropic":
        from canopy.services.llm.anthropic_client import (
            DEFAULT_MODEL,
            AnthropicLLMClient,
        )

        model = os.environ.get("CANOPY_ANTHROPIC_MODEL") or DEFAULT_MODEL
        return AnthropicLLMClient(kb, model=model)
    if provider == "ollama":
        from canopy.services.llm.ollama_client import OllamaLLMClient

        return OllamaLLMClient(kb)
    from canopy.services.llm.stub import StubLLMClient

    return StubLLMClient(kb)


def _resolve_provider(*, llm_flag: str | None, live_flag: bool) -> str:
    if llm_flag:
        return llm_flag
    env_llm = os.environ.get("CANOPY_LLM")
    if env_llm:
        return env_llm.lower()
    if live_flag or os.environ.get("CANOPY_LIVE"):
        return "anthropic"
    return "stub"


def _should_require_recommendation(
    scenarios: list[Path], policy: str, *, live: bool = False
) -> bool:
    if policy == "always":
        return True
    if policy == "never":
        return False
    if live:
        # Live Claude may choose a local defensive warning for the same evidence
        # that the stub maps to a request-authority recommendation. In live mode
        # auto verifies pipeline health, not exact model choice.
        return False
    return any(path.name in RECOMMENDATION_SCENARIOS for path in scenarios)


async def _verify(
    scenarios: list[Path],
    *,
    provider: str = "stub",
    require_recommendation: bool = True,
    timeout_s: float | None = None,
    drain_s: float | None = None,
) -> int:
    bus = InProcessBus()
    kb = KB.load_from_json(ROOT / "data" / "kb_seed_entries.json")
    llm = _build_llm(provider=provider, kb=kb)
    is_external = provider != "stub"

    orbit = OrbitService()

    fusion = FusionService(bus)
    attrib = AttribService(bus, llm, kb, window_s=0.2)
    decide = DecideService(bus, llm, orbit=orbit)
    ui = UIEventService(bus)

    collected: dict[str, list] = {
        "anomaly": [],
        "attribution": [],
        "decision": [],
        "ui_event": [],
    }

    async def sniff(pattern: str, key: str) -> None:
        async for topic, event in bus.subscribe(pattern):
            collected[key].append((topic, event))

    replay_done = asyncio.Event()
    replay = ScenarioReplayService(
        bus,
        scenarios,
        speed=200.0,
        max_delay_s=0.05,
        stop_when_done=replay_done,
    )

    tasks = [
        asyncio.create_task(fusion.run(), name="fusion"),
        asyncio.create_task(attrib.run(), name="attrib"),
        asyncio.create_task(decide.run(), name="decide"),
        asyncio.create_task(ui.run(), name="ui_events"),
        asyncio.create_task(sniff("anomalies.*", "anomaly")),
        asyncio.create_task(sniff("attributions.*", "attribution")),
        asyncio.create_task(sniff("decisions.*", "decision")),
        asyncio.create_task(sniff("ui_events.*", "ui_event")),
        asyncio.create_task(replay.run(), name="replay"),
    ]

    overall_budget_s = timeout_s if timeout_s is not None else (
        TIMEOUT_LIVE_S if is_external else TIMEOUT_STUB_S
    )
    quiescent_drain_s = drain_s if drain_s is not None else (
        DRAIN_LIVE_S if is_external else DRAIN_STUB_S
    )

    try:
        await asyncio.wait_for(replay_done.wait(), timeout=overall_budget_s)
        deadline = asyncio.get_running_loop().time() + overall_budget_s
        while asyncio.get_running_loop().time() < deadline:
            if all(
                collected[k]
                for k in ("anomaly", "attribution", "decision", "ui_event")
            ):
                await asyncio.sleep(quiescent_drain_s)
                break
            await asyncio.sleep(0.5)
    except TimeoutError:
        pass
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        bus.close()

    failures: list[str] = []
    if not collected["anomaly"]:
        failures.append("no Anomaly events")
    elif not all(isinstance(event, Anomaly) for _, event in collected["anomaly"]):
        failures.append("non-Anomaly leaked onto anomalies.*")
    if not collected["attribution"]:
        failures.append("no Attribution events")
    elif not all(
        isinstance(event, Attribution) for _, event in collected["attribution"]
    ):
        failures.append("non-Attribution leaked onto attributions.*")
    if not collected["decision"]:
        failures.append("no Decision events")
    elif not all(isinstance(event, Decision) for _, event in collected["decision"]):
        failures.append("non-Decision leaked onto decisions.*")
    if not collected["ui_event"]:
        failures.append("no UIEvent events")
    elif not all(isinstance(event, UIEvent) for _, event in collected["ui_event"]):
        failures.append("non-UIEvent leaked onto ui_events.*")

    if require_recommendation and collected["ui_event"]:
        rec_types = {ui_event.type for _, ui_event in collected["ui_event"]}
        if "recommendation_created" not in rec_types:
            failures.append("no UIEvent of type=recommendation_created")

    if failures:
        print("VERIFY FAILED:", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        print(f"  collected: {_summary(collected)}", file=sys.stderr)
        return 1

    print("VERIFY OK")
    print(f"  scenarios: {[path.name for path in scenarios]}")
    for key in ("anomaly", "attribution", "decision", "ui_event"):
        items = collected[key]
        kinds = []
        for _, event in items[:6]:
            if hasattr(event, "kind"):
                kinds.append(event.kind)
            elif hasattr(event, "actor"):
                kinds.append(event.actor)
            elif hasattr(event, "action"):
                kinds.append(event.action)
            elif hasattr(event, "type"):
                kinds.append(event.type)
        print(f"  {key}: n={len(items)} sample={kinds}")
    return 0


def _summary(collected: dict) -> str:
    return ", ".join(f"{key}={len(value)}" for key, value in collected.items())


def main() -> int:
    load_dotenv()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--llm",
        choices=LLM_PROVIDERS,
        default=None,
        help=(
            "LLM provider: 'stub' (default, no network), 'anthropic' "
            "(requires ANTHROPIC_API_KEY), or 'ollama' (requires "
            "CANOPY_OLLAMA_URL). Falls back to CANOPY_LLM env var, "
            "then to --live/CANOPY_LIVE, then to stub."
        ),
    )
    parser.add_argument(
        "--live",
        action="store_true",
        default=bool(os.environ.get("CANOPY_LIVE")),
        help="Deprecated alias for --llm anthropic.",
    )
    parser.add_argument(
        "--require-recommendation",
        choices=["auto", "always", "never"],
        default="auto",
        help=(
            "Whether to require a recommendation_created UIEvent. Auto requires "
            "it only for stub-mode recommendation scenarios; live mode auto "
            "checks pipeline health because model choices can vary."
        ),
    )
    parser.add_argument(
        "--timeout-s",
        type=float,
        help=(
            "Seconds to wait for scenario replay completion. Defaults to "
            f"{TIMEOUT_STUB_S:g}s stub / {TIMEOUT_LIVE_S:g}s live."
        ),
    )
    parser.add_argument(
        "--drain-s",
        type=float,
        help=(
            "Seconds to let attribution, decision, and UI tasks drain after "
            f"replay. Defaults to {DRAIN_STUB_S:g}s stub / {DRAIN_LIVE_S:g}s live."
        ),
    )
    parser.add_argument(
        "scenarios",
        nargs="*",
        help="Scenario JSONL paths (default: all four canonical beats).",
    )
    args = parser.parse_args()
    provider = _resolve_provider(llm_flag=args.llm, live_flag=args.live)
    is_external = provider != "stub"
    scenarios = [Path(path) for path in args.scenarios] or DEFAULT_SCENARIOS
    return asyncio.run(
        _verify(
            scenarios,
            provider=provider,
            require_recommendation=_should_require_recommendation(
                scenarios, args.require_recommendation, live=is_external
            ),
            timeout_s=args.timeout_s,
            drain_s=args.drain_s,
        )
    )


if __name__ == "__main__":
    sys.exit(main())
