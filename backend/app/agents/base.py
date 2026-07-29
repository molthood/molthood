"""Abstract agent interface.

Every agent Molthood will ever ship inherits from `BaseAgent`. Phase 3 defines
the contract and the lifecycle; no agent performs work yet.
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import ClassVar

from app.core.exceptions import AgentError, NotImplementedYetError
from app.engine.context import ExecutionContext
from app.engine.result import AgentResult
from app.engine.task import Task
from app.logging import get_logger
from app.models.enums import AgentKind

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class AgentMetadata:
    """Static description of an agent. Declared once per subclass."""

    kind: AgentKind
    name: str
    description: str
    version: str = "0.1.0"
    capabilities: tuple[str, ...] = field(default_factory=tuple)


class BaseAgent(ABC):
    """Contract shared by every agent.

    Subclasses declare `metadata` and implement `run`. `execute` is the
    template method the engine calls — it owns timing, logging, and error
    normalisation so no subclass has to repeat any of it.
    """

    metadata: ClassVar[AgentMetadata]

    #: Flipped to True by a subclass once it performs real work. The engine
    #: reads this to decide whether a task can run or must be skipped.
    implemented: ClassVar[bool] = False

    def __init_subclass__(cls, **kwargs: object) -> None:
        super().__init_subclass__(**kwargs)
        # Catch a missing declaration at import time rather than at dispatch.
        if not getattr(cls, "__abstractmethods__", None) and not hasattr(cls, "metadata"):
            raise TypeError(f"{cls.__name__} must declare a `metadata` attribute.")

    @property
    def kind(self) -> AgentKind:
        return self.metadata.kind

    async def execute(self, task: Task, context: ExecutionContext) -> AgentResult:
        """Run one task, with timing and uniform error handling."""
        log = logger.bind(
            agent=self.metadata.kind.value,
            task=task.name,
            execution_id=context.execution_id,
        )

        if not self.implemented:
            raise NotImplementedYetError(
                f"{self.metadata.name} has no implementation in this phase.",
                details={"agent": self.metadata.kind.value, "enabled_in": "phase_4"},
            )

        started = time.perf_counter()
        log.info("agent_task_started")

        try:
            result = await self.run(task, context)
        except NotImplementedYetError:
            raise
        except Exception as exc:  # normalised so the engine sees one error type
            log.exception("agent_task_error", error=str(exc))
            raise AgentError(
                f"{self.metadata.name} failed while handling '{task.name}'.",
                details={"agent": self.metadata.kind.value, "task": task.name},
            ) from exc

        duration_ms = int((time.perf_counter() - started) * 1000)
        log.info("agent_task_finished", success=result.success, duration_ms=duration_ms)
        return result

    @abstractmethod
    async def run(self, task: Task, context: ExecutionContext) -> AgentResult:
        """Perform the task. Implemented per agent in a later phase."""

    def describe(self) -> dict[str, object]:
        return {
            "kind": self.metadata.kind.value,
            "name": self.metadata.name,
            "description": self.metadata.description,
            "version": self.metadata.version,
            "capabilities": list(self.metadata.capabilities),
            "implemented": self.implemented,
        }
