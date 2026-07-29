"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Query

from app.agents.registry import AgentRegistry, agent_registry
from app.config import Settings, get_settings
from app.core.constants import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.engine.engine import ExecutionEngine, execution_engine
from app.pipelines.registry import PipelineRegistry, pipeline_registry
from app.repositories import ExecutionStore, get_execution_store
from app.services.registry import ServiceRegistry, get_service_registry
from app.utils.pagination import Pagination


def pagination_params(
    page: Annotated[int, Query(ge=1, description="1-indexed page number.")] = 1,
    page_size: Annotated[
        int, Query(ge=1, le=MAX_PAGE_SIZE, description="Items per page.")
    ] = DEFAULT_PAGE_SIZE,
) -> Pagination:
    return Pagination(page=page, page_size=page_size)


def get_agent_registry_dep() -> AgentRegistry:
    return agent_registry


def get_pipeline_registry_dep() -> PipelineRegistry:
    return pipeline_registry


def get_engine_dep() -> ExecutionEngine:
    return execution_engine


PaginationDep = Annotated[Pagination, Depends(pagination_params)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
AgentRegistryDep = Annotated[AgentRegistry, Depends(get_agent_registry_dep)]
PipelineRegistryDep = Annotated[PipelineRegistry, Depends(get_pipeline_registry_dep)]
ServiceRegistryDep = Annotated[ServiceRegistry, Depends(get_service_registry)]
EngineDep = Annotated[ExecutionEngine, Depends(get_engine_dep)]
ExecutionStoreDep = Annotated[ExecutionStore, Depends(get_execution_store)]
