"""Task — the unit of work an agent receives."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.models.base import new_id
from app.models.enums import AgentKind, TaskStatus


@dataclass(slots=True)
class Task:
    """One step of an execution plan, owned by exactly one agent."""

    name: str
    agent_kind: AgentKind | None = None
    sequence: int = 0
    payload: dict[str, Any] = field(default_factory=dict)

    id: str = field(default_factory=new_id)
    status: TaskStatus = TaskStatus.PENDING
    output: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    duration_ms: int | None = None

    def mark_running(self) -> None:
        self.status = TaskStatus.RUNNING

    def mark_completed(self, output: dict[str, Any], duration_ms: int) -> None:
        self.status = TaskStatus.COMPLETED
        self.output = output
        self.duration_ms = duration_ms

    def mark_failed(self, error: str, duration_ms: int | None = None) -> None:
        self.status = TaskStatus.FAILED
        self.error = error
        self.duration_ms = duration_ms

    def mark_skipped(self, reason: str) -> None:
        self.status = TaskStatus.SKIPPED
        self.error = reason

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "sequence": self.sequence,
            "name": self.name,
            "agent_kind": self.agent_kind.value if self.agent_kind else None,
            "status": self.status.value,
            "duration_ms": self.duration_ms,
            "output": self.output,
            "error": self.error,
        }
