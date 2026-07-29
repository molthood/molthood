"""Task queue contract.

The interface Phase 4 will implement against Redis. Nothing here connects to a
broker, and nothing runs work in the background.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from functools import lru_cache
from typing import Any

from app.core.exceptions import NotImplementedYetError
from app.logging import get_logger

logger = get_logger(__name__)


class TaskQueue(ABC):
    """Contract for deferring work outside the request cycle."""

    @abstractmethod
    async def enqueue(self, name: str, payload: dict[str, Any]) -> str:
        """Schedule a job and return its id."""

    @abstractmethod
    async def size(self) -> int:
        """Number of jobs currently waiting."""


class InMemoryTaskQueue(TaskQueue):
    """Placeholder implementation.

    Deliberately refuses to accept work: silently queueing into a process-local
    list would look like a working background system while dropping every job
    on restart.
    """

    async def enqueue(self, name: str, payload: dict[str, Any]) -> str:
        raise NotImplementedYetError(
            "Background task execution is not enabled in this phase.",
            details={"task": name, "enabled_in": "phase_4", "broker": "redis"},
        )

    async def size(self) -> int:
        return 0


@lru_cache(maxsize=1)
def get_task_queue() -> TaskQueue:
    return InMemoryTaskQueue()
