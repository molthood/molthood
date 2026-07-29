"""Pipelines — ordered stage sequences the engine executes."""

from app.pipelines.base import Pipeline, Stage
from app.pipelines.registry import PipelineRegistry, pipeline_registry
from app.pipelines.stages import (
    CollectStage,
    EvidenceStage,
    InputStage,
    RouteStage,
    SummaryStage,
)
from app.pipelines.standard import StandardPipeline

__all__ = [
    "CollectStage",
    "EvidenceStage",
    "InputStage",
    "Pipeline",
    "PipelineRegistry",
    "RouteStage",
    "Stage",
    "StandardPipeline",
    "SummaryStage",
    "pipeline_registry",
]
