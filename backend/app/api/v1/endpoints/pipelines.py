"""`/api/v1/pipelines` — introspection of the registered pipelines."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import PipelineRegistryDep

router = APIRouter(tags=["pipelines"])


@router.get(
    "",
    summary="List pipelines",
    description="Every registered pipeline and the stages it runs, in order.",
)
async def list_pipelines(registry: PipelineRegistryDep) -> dict[str, object]:
    pipelines = [pipeline.describe() for pipeline in registry.list()]
    return {"items": pipelines, "total": len(pipelines)}
