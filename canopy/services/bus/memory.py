from __future__ import annotations

import asyncio
import fnmatch
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Protocol

from pydantic import BaseModel

log = logging.getLogger(__name__)


class Bus(Protocol):
    async def publish(self, topic: str, event: BaseModel) -> None: ...

    def subscribe(
        self, topic_pattern: str
    ) -> AsyncIterator[tuple[str, BaseModel]]: ...


@dataclass
class _Subscription:
    pattern: str
    queue: asyncio.Queue[tuple[str, BaseModel]]
    closed: bool = field(default=False)


class InProcessBus:
    """Single-process asyncio pub/sub.

    Subscribers receive every published event whose topic matches their pattern
    (fnmatch glob). Each subscriber has its own bounded queue; overflow drops
    the new event with a warning rather than blocking the publisher.

    All operations assume a single event loop (no thread-safety).
    """

    def __init__(self, *, queue_maxsize: int = 1024) -> None:
        self._queue_maxsize = queue_maxsize
        self._subs: list[_Subscription] = []

    async def publish(self, topic: str, event: BaseModel) -> None:
        for sub in list(self._subs):
            if sub.closed or not fnmatch.fnmatchcase(topic, sub.pattern):
                continue
            try:
                sub.queue.put_nowait((topic, event))
            except asyncio.QueueFull:
                log.warning(
                    "bus overflow: dropping event topic=%s pattern=%s qsize=%d",
                    topic,
                    sub.pattern,
                    sub.queue.qsize(),
                )

    def subscribe(
        self, topic_pattern: str
    ) -> AsyncIterator[tuple[str, BaseModel]]:
        sub = _Subscription(
            pattern=topic_pattern,
            queue=asyncio.Queue(maxsize=self._queue_maxsize),
        )
        self._subs.append(sub)
        return self._stream(sub)

    async def _stream(
        self, sub: _Subscription
    ) -> AsyncIterator[tuple[str, BaseModel]]:
        try:
            while not sub.closed:
                item = await sub.queue.get()
                yield item
        finally:
            sub.closed = True
            if sub in self._subs:
                self._subs.remove(sub)

    def close(self) -> None:
        for sub in self._subs:
            sub.closed = True
        self._subs.clear()
