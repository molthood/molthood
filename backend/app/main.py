"""Application entry point.

`create_app` is a factory so tests can build an isolated instance, and so
uvicorn can reload without importing side effects at module scope.
"""

from __future__ import annotations

from fastapi import FastAPI

from app.api import register_routers
from app.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.lifespan import lifespan
from app.logging import configure_logging
from app.middleware import register_middleware
from app.schemas.common import ErrorResponse

DESCRIPTION = """
Backend for **Molthood**, the AI execution platform for Robinhood Chain.

Every analysis reads live chain data. Findings carry a state — `confirmed`,
`refuted`, or `unknown` — because a check that could not run is not a check
that came back clean, and a client must never render one as the other.

**Authentication.** Analyses spend real inference credit, so they require an
API key and are metered against a daily allowance. Create one with
`POST /api/v1/keys`; the secret is shown once and stored only as a hash.

Anything not yet implemented raises `501 not_implemented` rather than
returning a fabricated success.
""".strip()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings)

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=DESCRIPTION,
        lifespan=lifespan,
        docs_url=settings.docs_url,
        redoc_url=settings.redoc_url,
        openapi_url=settings.openapi_url,
        responses={
            422: {"model": ErrorResponse, "description": "Validation error"},
            500: {"model": ErrorResponse, "description": "Internal error"},
            501: {"model": ErrorResponse, "description": "Not implemented in this phase"},
        },
    )

    register_middleware(app, settings)
    register_exception_handlers(app)
    register_routers(app, settings)

    return app


app = create_app()
