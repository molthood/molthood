"""Aggregates every v1 endpoint under a single router."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import (
    agents,
    chain,
    execute,
    executions,
    feed,
    hooks,
    keys,
    pipelines,
    providers,
    reports,
    status,
    stream,
    tasks,
    watches,
)

router = APIRouter()

# Execution routes sit at the version root: /api/v1/execute, /token/{address}, …
router.include_router(execute.router)
router.include_router(stream.router)

router.include_router(status.router, prefix="/status")
router.include_router(chain.router, prefix="/chain")
router.include_router(agents.router, prefix="/agents")
router.include_router(executions.router, prefix="/executions")
router.include_router(keys.router, prefix="/keys")
router.include_router(pipelines.router, prefix="/pipelines")
router.include_router(reports.router, prefix="/reports")
router.include_router(providers.router, prefix="/providers")
router.include_router(feed.router, prefix="/feed")
router.include_router(hooks.router, prefix="/hooks")
router.include_router(tasks.router, prefix="/tasks")
router.include_router(watches.router, prefix="/watches")
