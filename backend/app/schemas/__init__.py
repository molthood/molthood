"""Pydantic v2 schemas — the public contract of the API."""

from app.schemas.common import (
    ErrorDetail,
    ErrorResponse,
    Page,
    PageMeta,
    SchemaBase,
)
from app.schemas.execution import (
    EvidenceItem,
    ExecutionCreate,
    ExecutionDetail,
    ExecutionRead,
    ExecutionResponse,
    SourceRef,
    StageRead,
    TaskRead,
)
from app.schemas.system import (
    ComponentStatus,
    DependencyStatus,
    HealthResponse,
    StatusResponse,
    VersionResponse,
)

__all__ = [
    "ComponentStatus",
    "DependencyStatus",
    "ErrorDetail",
    "ErrorResponse",
    "EvidenceItem",
    "ExecutionCreate",
    "ExecutionDetail",
    "ExecutionRead",
    "ExecutionResponse",
    "HealthResponse",
    "Page",
    "PageMeta",
    "SchemaBase",
    "SourceRef",
    "StageRead",
    "StatusResponse",
    "TaskRead",
    "VersionResponse",
]
