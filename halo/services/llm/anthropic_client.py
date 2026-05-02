from __future__ import annotations

import json
import logging
import os
from collections.abc import Iterable
from typing import Any

from halo.services.kb import KB
from halo.services.kb.models import KBEntry
from halo.services.schemas.events import Anomaly, Attribution, Decision

log = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-sonnet-4-6"


class AnthropicLLMClient:
    """Live LLMClient backed by the Anthropic API.

    Foundation-pass implementation: thin wrapper around tool-use with strict
    JSON-typed tools. Prompt content lives in
    ``halo.services.{attrib,decide}.prompts`` so prompt iteration is a
    single-file change in the next pass. The ``anthropic`` SDK is imported
    lazily so stub-only runs do not require an API key.
    """

    def __init__(self, kb: KB, *, model: str = DEFAULT_MODEL) -> None:
        from anthropic import AsyncAnthropic

        self._kb = kb
        self._model = model
        self._client = AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    async def attribute(
        self, anomalies: list[Anomaly], kb_context: Iterable[KBEntry] = ()
    ) -> Attribution:
        from halo.services.attrib.prompts import (
            ATTRIBUTION_TOOL,
            attribution_system_prompt,
            attribution_user_prompt,
        )

        # Prefer KB entries that match the anomaly's source signal ids; fall
        # back to all entries if there are no matches yet.
        source_ids = [
            sid for a in anomalies for sid in a.source_signal_ids
        ]
        relevant: list[KBEntry] = list(kb_context)
        if not relevant:
            seen: set[str] = set()
            for sid in source_ids:
                for entry in self._kb.by_scenario_signal_id(sid):
                    if entry.id not in seen:
                        relevant.append(entry)
                        seen.add(entry.id)
            if not relevant:
                relevant = self._kb.all_entries()

        response = await self._client.messages.create(
            model=self._model,
            max_tokens=1024,
            system=attribution_system_prompt(),
            tools=[ATTRIBUTION_TOOL],
            tool_choice={"type": "tool", "name": ATTRIBUTION_TOOL["name"]},
            messages=[
                {
                    "role": "user",
                    "content": attribution_user_prompt(anomalies, relevant),
                }
            ],
        )
        payload = _extract_tool_input(response, ATTRIBUTION_TOOL["name"])
        return Attribution(
            anomaly_ids=[a.id for a in anomalies],
            actor=payload["actor"],
            confidence=float(payload["confidence"]),
            doctrine_match=payload.get("doctrine_match"),
            evidence=list(payload.get("evidence", [])),
            predicted_next=payload.get("predicted_next"),
            kb_citations=list(payload.get("kb_citations", [])),
            source_signal_ids=list(
                dict.fromkeys(sid for a in anomalies for sid in a.source_signal_ids)
            ),
        )

    async def decide(self, attribution: Attribution) -> Decision:
        from halo.services.decide.prompts import (
            DECISION_TOOL,
            decision_system_prompt,
            decision_user_prompt,
        )

        response = await self._client.messages.create(
            model=self._model,
            max_tokens=1024,
            system=decision_system_prompt(),
            tools=[DECISION_TOOL],
            tool_choice={"type": "tool", "name": DECISION_TOOL["name"]},
            messages=[
                {"role": "user", "content": decision_user_prompt(attribution)}
            ],
        )
        payload = _extract_tool_input(response, DECISION_TOOL["name"])
        return Decision(
            attribution_id=attribution.id,
            action=payload["action"],
            target=payload["target"],
            rationale=payload["rationale"],
            authority=payload["authority"],
            request_packet=payload.get("request_packet"),
            source_signal_ids=list(attribution.source_signal_ids),
        )


def _extract_tool_input(response: Any, tool_name: str) -> dict:
    for block in response.content:
        if getattr(block, "type", None) == "tool_use" and block.name == tool_name:
            return block.input  # type: ignore[no-any-return]
    raise ValueError(
        f"Anthropic response did not contain a tool_use for {tool_name}: "
        f"{json.dumps([b.model_dump() for b in response.content], default=str)[:500]}"
    )
