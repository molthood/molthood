"""Request-scoped context, timing, and access logging."""

from __future__ import annotations

import time
import uuid
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.constants import REQUEST_ID_HEADER, RESPONSE_TIME_HEADER
from app.logging import bind_request_context, get_logger, reset_request_context

logger = get_logger("app.request")

CallNext = Callable[[Request], Awaitable[Response]]


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assigns a request id, times the request, and emits one access log line.

    Replaces uvicorn's access log so that every entry carries the same request
    id as the application logs produced while handling it.
    """

    async def dispatch(self, request: Request, call_next: CallNext) -> Response:
        # Honour an inbound id so a trace survives across service hops.
        request_id = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex
        route = f"{request.method} {request.url.path}"

        tokens = bind_request_context(request_id, route)
        request.state.request_id = request_id

        started = time.perf_counter()
        status_code = 500

        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception:
            # The exception handlers render the body; this only records timing.
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            logger.exception(
                "request_failed",
                method=request.method,
                path=request.url.path,
                status_code=status_code,
                duration_ms=duration_ms,
            )
            reset_request_context(tokens)
            raise

        duration_ms = round((time.perf_counter() - started) * 1000, 2)

        response.headers[REQUEST_ID_HEADER] = request_id
        response.headers[RESPONSE_TIME_HEADER] = str(duration_ms)

        logger.info(
            "request_completed",
            method=request.method,
            path=request.url.path,
            status_code=status_code,
            duration_ms=duration_ms,
            client=request.client.host if request.client else None,
        )

        reset_request_context(tokens)
        return response
