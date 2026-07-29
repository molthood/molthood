"""Global exception handlers.

Produces a single error envelope for every failure mode, always carrying a
machine-readable code, a human message, and a suggested action.

Stack traces and upstream response bodies never reach the client.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.exceptions import MolthoodError
from app.logging import get_logger, get_request_id

logger = get_logger(__name__)


def _envelope(
    *,
    code: str,
    message: str,
    suggested_action: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "suggested_action": suggested_action,
            "details": details or {},
        },
        "request_id": get_request_id(),
    }


def error_response(exc: MolthoodError) -> JSONResponse:
    """Render an error without going through the handler chain.

    Middleware sits outside the application's exception handlers, so a limiter
    that raised would produce a bare 500 with none of this envelope. Building
    the response directly keeps a rate-limited caller receiving exactly the
    same shape as every other failure.
    """
    return JSONResponse(
        status_code=exc.status_code,
        content=_envelope(
            code=exc.code,
            message=exc.message,
            suggested_action=exc.suggested_action,
            details=exc.details,
        ),
    )


async def molthood_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, MolthoodError)

    logger.warning(
        "application_error",
        code=exc.code,
        status_code=exc.status_code,
        detail=exc.message,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=_envelope(
            code=exc.code,
            message=exc.message,
            suggested_action=exc.suggested_action,
            details=exc.details,
        ),
    )


async def http_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)

    action = (
        "Check the URL. See /docs for the available routes."
        if exc.status_code == 404
        else "Review the request and try again."
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=_envelope(
            code="http_error",
            message=str(exc.detail),
            suggested_action=action,
        ),
        headers=getattr(exc, "headers", None),
    )


async def validation_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)

    logger.info("request_validation_failed", errors=exc.errors())
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=_envelope(
            code="validation_error",
            message="The request payload failed validation.",
            suggested_action="Correct the fields listed in details and resubmit.",
            # `errors()` can carry non-serialisable values; coerce defensively.
            details={
                "errors": [
                    {
                        "field": ".".join(str(part) for part in error.get("loc", [])),
                        "message": str(error.get("msg")),
                    }
                    for error in exc.errors()
                ]
            },
        ),
    )


async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    # Logged with the traceback; the client gets none of it.
    logger.exception("unhandled_exception", error=str(exc))
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=_envelope(
            code="internal_error",
            message="An unexpected error occurred.",
            suggested_action=(
                "Retry the request. Quote the request_id if you contact support."
            ),
        ),
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Attach every handler to the application."""
    app.add_exception_handler(MolthoodError, molthood_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
