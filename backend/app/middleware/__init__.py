"""HTTP middleware registration."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings
from app.core.constants import REQUEST_ID_HEADER, RESPONSE_TIME_HEADER
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.request_context import RequestContextMiddleware

__all__ = ["RateLimitMiddleware", "RequestContextMiddleware", "register_middleware"]


def register_middleware(app: FastAPI, settings: Settings) -> None:
    """Install middleware.

    Order matters: Starlette runs middleware in reverse registration order, so
    registering the context middleware last puts it outermost — timings then
    include CORS handling, and a request id exists before anything else runs.

    The rate limiter goes on before that context layer and after CORS, which
    puts it inside the CORS handler. That is deliberate: a 429 still needs its
    `access-control-allow-origin` header, or the browser hides the response and
    the console shows a generic network failure instead of "slow down".
    """
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[REQUEST_ID_HEADER, RESPONSE_TIME_HEADER],
    )
    app.add_middleware(RateLimitMiddleware, settings=settings)
    app.add_middleware(RequestContextMiddleware)
