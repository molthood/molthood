"""Execution engine: Request → Router → Services → Evidence → Summary → Result.

Only the **data types** are re-exported here. `ExecutionEngine` is not, on
purpose: it depends on `app.pipelines`, whose stages depend on `app.agents`,
whose base class imports the types below. Re-exporting the orchestrator would
close that loop and make `app.agents` unimportable.

Import the engine from `app.engine.engine`.
"""

from app.engine.context import (
    Evidence,
    ExecutionContext,
    ExecutionRequest,
    Source,
)
from app.engine.result import AgentResult, ExecutionResult, StageResult
from app.engine.task import Task

__all__ = [
    "AgentResult",
    "Evidence",
    "ExecutionContext",
    "ExecutionRequest",
    "ExecutionResult",
    "Source",
    "StageResult",
    "Task",
]
