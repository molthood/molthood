"""Request rate limiting.

Two different problems get two different mechanisms, and conflating them is the
usual mistake:

* **This file caps pace.** It protects the server and the upstream explorers
  from a burst. Losing its state on restart costs nothing, so it lives in
  memory and stays fast.
* **`repositories.api_keys` caps spend.** That one guards real inference
  credit, so it lives in the database, survives a restart, and holds across
  workers.

The honest limitation: this limiter is per **process**. Run several workers and
each enforces its own window, so the effective limit multiplies by the worker
count. That is acceptable for burst control — the spend cap is the one that has
to be exact, and it is not in here. Point `RATE_LIMIT_BACKEND` at Redis when
that stops being true.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.config import Settings
from app.core.errors import error_response
from app.core.exceptions import RateLimitError
from app.logging import get_logger

logger = get_logger(__name__)

#: Paths that must answer even under pressure. A liveness probe that gets
#: rate-limited will have the orchestrator restart a perfectly healthy process.
EXEMPT_PATHS: frozenset[str] = frozenset({"/health", "/version"})

#: Most a single client may accumulate before old entries are dropped. Bounds
#: memory against a caller that fires continuously.
_MAX_TRACKED_HITS = 512


@dataclass(slots=True)
class _Window:
    """Timestamps of recent requests from one caller."""

    hits: deque[float] = field(default_factory=deque)

    def allow(self, limit: int, window_seconds: float, now: float) -> float | None:
        """Record a hit, or return how long to wait before retrying."""
        cutoff = now - window_seconds
        while self.hits and self.hits[0] <= cutoff:
            self.hits.popleft()

        if len(self.hits) >= limit:
            # The oldest hit leaving the window is when a slot frees up.
            return max(0.0, self.hits[0] + window_seconds - now)

        self.hits.append(now)
        if len(self.hits) > _MAX_TRACKED_HITS:
            self.hits.popleft()
        return None


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Fixed limit per caller per rolling window."""

    def __init__(self, app: object, settings: Settings) -> None:
        super().__init__(app)  # type: ignore[arg-type]
        self._settings = settings
        self._windows: dict[str, _Window] = {}
        self._last_sweep = time.monotonic()

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if not self._settings.rate_limit_enabled or request.url.path in EXEMPT_PATHS:
            return await call_next(request)

        identity = self._identify(request)
        now = time.monotonic()
        self._sweep(now)

        window = self._windows.setdefault(identity, _Window())
        retry_after = window.allow(
            self._settings.rate_limit_requests,
            float(self._settings.rate_limit_window_seconds),
            now,
        )

        if retry_after is not None:
            logger.warning(
                "rate_limited",
                path=request.url.path,
                retry_after=round(retry_after, 2),
            )
            error = RateLimitError(
                (
                    f"More than {self._settings.rate_limit_requests} requests in "
                    f"{self._settings.rate_limit_window_seconds}s."
                ),
                details={"retry_after": round(retry_after, 2)},
            )
            response = error_response(error)
            response.headers["retry-after"] = str(max(1, round(retry_after)))
            return response

        return await call_next(request)

    def _identify(self, request: Request) -> str:
        """Who to count against.

        A key is preferred over an address: several people behind one office NAT
        share an IP, and holding them to a single budget would punish them for
        their network topology. The key is hashed rather than stored raw so the
        limiter never holds a usable credential in memory.
        """
        header = request.headers.get("authorization", "")
        if header.lower().startswith("bearer "):
            token = header[7:].strip()
            if token:
                return f"key:{hash(token)}"

        return f"ip:{self._client_ip(request)}"

    @staticmethod
    def _client_ip(request: Request) -> str:
        """The caller's address, trusting a proxy header only if configured.

        `x-forwarded-for` is caller-supplied and trivially spoofed, so reading
        it unconditionally would let anyone reset their own limit by inventing
        a header. It is only consulted behind a proxy that is known to set it.
        """
        from app.config import get_settings

        if get_settings().trust_proxy_headers:
            forwarded = request.headers.get("x-forwarded-for")
            if forwarded:
                return forwarded.split(",")[0].strip()

        return request.client.host if request.client else "unknown"

    def _sweep(self, now: float) -> None:
        """Drop callers that have gone quiet, so the map cannot grow forever."""
        if now - self._last_sweep < 60.0:
            return

        self._last_sweep = now
        cutoff = now - float(self._settings.rate_limit_window_seconds) * 2
        stale = [
            identity
            for identity, window in self._windows.items()
            if not window.hits or window.hits[-1] <= cutoff
        ]
        for identity in stale:
            del self._windows[identity]


def client_ip(request: Request) -> str:
    """Shared with the signup endpoint, which limits keys per source."""
    return RateLimitMiddleware._client_ip(request)
