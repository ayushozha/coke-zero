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
    JSON-typed tools. Prompt content lives in `halo.services.{attrib,decide}.prompts`
    so prompt iteration is a single-file change in the next pass. The
    `anthropic` SDK is imported lazily so stub-only runs do not require an
    API key.
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

        kb_entries = list(kb_context) or self._kb.all_entries()
        response = await self._client.messages.create(
            model=self._model,
            max_tokens=1024,
            system=attribution_system_prompt(),
            tools=[ATTRIBUTION_TOOL],
            tool_choice={"type": "tool", "name": ATTRIBUTION_TOOL["name"]},
            messages=[
                {
                    "role": "user",
                    "content": attribution_user_prompt(anomalies, kb_entries),
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
        )


def _extract_tool_input(response: Any, tool_name: str) -> dict:
    for block in response.content:
        if getattr(block, "type", None) == "tool_use" and block.name == tool_name:
            return block.input  # type: ignore[no-any-return]
    raise ValueError(
        f"Anthropic response did not contain a tool_use for {tool_name}: "
        f"{json.dumps([b.model_dump() for b in response.content], default=str)[:500]}"
    )
