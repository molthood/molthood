"""structlog configuration.

Emits `console` output locally and line-delimited `json` everywhere else.

structlog is routed through the standard library rather than printing
directly: application logs and uvicorn's own logs then share one handler, one
formatter, and one output stream. The request id and route are injected from
contextvars, so every line produced while handling a request carries them
without the caller passing anything.
"""

from __future__ import annotations

import logging
import sys
from typing import Any

import structlog
from structlog.types import EventDict, Processor

from app.config import Settings
from app.logging.context import request_id_var, route_var


def _add_request_context(_logger: Any, _method: str, event_dict: EventDict) -> EventDict:
    """Copy the active request id and route onto the log record."""
    request_id = request_id_var.get()
    if request_id is not None:
        event_dict.setdefault("request_id", request_id)

    route = route_var.get()
    if route is not None:
        event_dict.setdefault("route", route)

    return event_dict


def configure_logging(settings: Settings) -> None:
    """Install structlog and route stdlib logging through the same pipeline."""
    level = getattr(logging, settings.log_level, logging.INFO)

    # Applied to structlog events *and* to records from stdlib loggers, so
    # uvicorn output carries the same fields as application output.
    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        _add_request_context,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    renderer: Processor = (
        structlog.processors.JSONRenderer()
        if settings.log_format == "json"
        else structlog.dev.ConsoleRenderer(colors=False)
    )

    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            *shared_processors,
            # Hands the event dict to ProcessorFormatter instead of rendering
            # it here; the formatter below does the rendering.
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.format_exc_info,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)

    for name in ("uvicorn", "uvicorn.error"):
        stdlib_logger = logging.getLogger(name)
        stdlib_logger.handlers = []
        stdlib_logger.propagate = True

    # httpx logs one INFO line per request, which duplicates our own
    # `service_call_ok` entry and buries it during multi-service executions.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

    # The access log is replaced by RequestContextMiddleware, which records the
    # same information plus a request id and a duration.
    logging.getLogger("uvicorn.access").disabled = True


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Typed logger accessor used across the application."""
    return structlog.stdlib.get_logger(name)
