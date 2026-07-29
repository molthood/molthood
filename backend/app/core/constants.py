"""Cross-cutting constants."""

from __future__ import annotations

from typing import Final

REQUEST_ID_HEADER: Final[str] = "X-Request-ID"
RESPONSE_TIME_HEADER: Final[str] = "X-Response-Time-Ms"

DEFAULT_PAGE_SIZE: Final[int] = 20
MAX_PAGE_SIZE: Final[int] = 100

#: The fixed order every execution moves through. Mirrors the product pipeline.
PIPELINE_STAGE_ORDER: Final[tuple[str, ...]] = (
    "input",
    "agents",
    "engine",
    "evidence",
    "report",
)
