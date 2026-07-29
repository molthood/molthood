"""ORM models.

Every model is imported here so that `Base.metadata` is fully populated for
Alembic autogeneration, regardless of import order elsewhere.
"""

from app.models.agent import Agent
from app.models.auth import ApiKey
from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, new_id, utcnow
from app.models.enums import (
    AgentKind,
    AgentStatus,
    ExecutionStatus,
    PipelineStage,
    ProjectStatus,
    ReportCategory,
    ServiceName,
    TaskStatus,
)
from app.models.execution import Execution, Task
from app.models.project import Project
from app.models.report import Report
from app.models.watch import Watch

__all__ = [
    "Agent",
    "AgentKind",
    "AgentStatus",
    "ApiKey",
    "Base",
    "Execution",
    "ExecutionStatus",
    "PipelineStage",
    "Project",
    "ProjectStatus",
    "Report",
    "ReportCategory",
    "ServiceName",
    "Task",
    "TaskStatus",
    "TimestampMixin",
    "UUIDPrimaryKeyMixin",
    "Watch",
    "new_id",
    "utcnow",
]
