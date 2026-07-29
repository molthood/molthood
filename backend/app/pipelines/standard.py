"""The standard analysis pipeline."""

from __future__ import annotations

from typing import ClassVar

from app.pipelines.base import Pipeline, Stage
from app.pipelines.stages import (
    CollectStage,
    EvidenceStage,
    InputStage,
    RouteStage,
    SummaryStage,
)


class StandardPipeline(Pipeline):
    """Input → Router → Service Layer → Evidence → AI Summary.

    The only pipeline in Phase 4, and the one the product describes publicly.
    """

    name: ClassVar[str] = "standard"
    description: ClassVar[str] = (
        "The default path every request takes, from submission to a compiled result."
    )

    def __init__(self) -> None:
        self._stages: tuple[Stage, ...] = (
            InputStage(),
            RouteStage(),
            CollectStage(),
            EvidenceStage(),
            SummaryStage(),
        )

    @property
    def stages(self) -> tuple[Stage, ...]:
        return self._stages


PIPELINE = StandardPipeline
