"""Repositories.

`ExecutionStore` is the only one, and it is now backed by the database rather
than by memory. Everything in it describes a run that actually happened.

Anything that genuinely has no source yet — projects, reports as a separate
resource — still has no repository here on purpose, rather than a fixture
standing in for one.
"""

from app.repositories.execution_store import (
    ExecutionRecord,
    ExecutionStore,
    cache_window_seconds,
    get_execution_store,
)

__all__ = [
    "ExecutionRecord",
    "ExecutionStore",
    "cache_window_seconds",
    "get_execution_store",
]
