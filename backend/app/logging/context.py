"""Per-request context propagated to every log line.

Uses `contextvars` so the request id reaches loggers deep in the call stack
without being threaded through every function signature.
"""

from __future__ import annotations

from contextvars import ContextVar, Token

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
route_var: ContextVar[str | None] = ContextVar("route", default=None)


def bind_request_context(
    request_id: str, route: str
) -> tuple[Token[str | None], Token[str | None]]:
    """Bind the current request. Returns tokens for `reset_request_context`."""
    return request_id_var.set(request_id), route_var.set(route)


def reset_request_context(tokens: tuple[Token[str | None], Token[str | None]]) -> None:
    request_id_token, route_token = tokens
    request_id_var.reset(request_id_token)
    route_var.reset(route_token)


def get_request_id() -> str | None:
    return request_id_var.get()
