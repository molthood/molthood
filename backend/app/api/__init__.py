"""HTTP API layer."""

from __future__ import annotations

from fastapi import FastAPI

from app.api.system import router as system_router
from app.api.v1.router import router as v1_router
from app.config import Settings

__all__ = ["register_routers", "system_router", "v1_router"]


def register_routers(app: FastAPI, settings: Settings) -> None:
    """Mount system routes at the root and versioned routes under the prefix."""
    app.include_router(system_router)
    app.include_router(v1_router, prefix=settings.api_prefix)
