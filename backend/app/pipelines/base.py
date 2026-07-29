"""Pipeline and stage contracts."""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from typing import ClassVar

from app.engine.context import ExecutionContext
from app.engine.result import StageResult
from app.logging import get_logger
from app.models.enums import PipelineStage

logger = get_logger(__name__)


class Stage(ABC):
    """One step of a pipeline.

    `execute` owns timing and logging; subclasses implement `run` and return a
    short summary of what they did.
    """

    stage: ClassVar[PipelineStage]

    async def execute(self, context: ExecutionContext) -> StageResult:
        context.stage = self.stage
        log = logger.bind(stage=self.stage.value, execution_id=context.execution_id)

        started = time.perf_counter()
        log.info("stage_started")
        # Announced before the work, not after: the point of a progress event
        # is to name what is taking the time while it is still taking it.
        await context.publish("stage_started", stage=self.stage.value)

        try:
            summary = await self.run(context)
        except Exception as exc:
            duration_ms = int((time.perf_counter() - started) * 1000)
            log.exception("stage_failed", error=str(exc))
            result = StageResult(
                stage=self.stage,
                success=False,
                error=str(exc),
                duration_ms=duration_ms,
            )
            await context.publish("stage_finished", **result.to_dict())
            return result

        duration_ms = int((time.perf_counter() - started) * 1000)
        log.info("stage_finished", duration_ms=duration_ms)
        result = StageResult(
            stage=self.stage,
            success=True,
            summary=summary,
            duration_ms=duration_ms,
        )
        await context.publish("stage_finished", **result.to_dict())
        return result

    @abstractmethod
    async def run(self, context: ExecutionContext) -> str:
        """Do the stage's work and return a one-line summary."""


class Pipeline(ABC):
    """An ordered sequence of stages."""

    name: ClassVar[str]
    description: ClassVar[str] = ""

    @property
    @abstractmethod
    def stages(self) -> tuple[Stage, ...]:
        """Stages in execution order."""

    def describe(self) -> dict[str, object]:
        return {
            "name": self.name,
            "description": self.description,
            "stages": [stage.stage.value for stage in self.stages],
        }
