"""Pipeline registry."""

from __future__ import annotations

from app.core.exceptions import NotFoundError
from app.pipelines.base import Pipeline
from app.pipelines.standard import StandardPipeline


class PipelineRegistry:
    """Maps a pipeline name to its instance."""

    def __init__(self) -> None:
        self._pipelines: dict[str, Pipeline] = {}
        self.register(StandardPipeline())

    def register(self, pipeline: Pipeline) -> None:
        self._pipelines[pipeline.name] = pipeline

    def get(self, name: str) -> Pipeline:
        pipeline = self._pipelines.get(name)
        if pipeline is None:
            raise NotFoundError(
                f"No pipeline registered under '{name}'.",
                details={"name": name, "available": sorted(self._pipelines)},
            )
        return pipeline

    def list(self) -> list[Pipeline]:
        return sorted(self._pipelines.values(), key=lambda pipeline: pipeline.name)


#: Process-wide pipeline registry.
pipeline_registry = PipelineRegistry()
