"""Error tracking, with the same rule that governs analytics.

Sentry needs to know *what broke and where*. It does not need to know **who
asked about what**, and this backend's error context is full of exactly that:
the address being analysed sits in the URL path, the request text sits in the
body, and a source URL sits in half the breadcrumbs.

So every event is scrubbed before it leaves. The scrubbing is subtractive in
the same direction as the public feed — fields are removed by name and paths
are rewritten to their route template — because a field added upstream later
must not leak by default.

Optional throughout. No DSN means no SDK call, no import cost, and no change in
behaviour: a platform that only works when its observability is configured has
made observability a dependency rather than a tool.
"""

from __future__ import annotations

import re
from typing import Any

from app.logging import get_logger

logger = get_logger(__name__)

#: Path segments that are somebody's subject rather than a route. Replaced so
#: errors group by endpoint instead of scattering into one issue per address.
_ADDRESS = re.compile(r"/0x[a-fA-F0-9]{6,}")
_HEX_ID = re.compile(r"/[a-f0-9]{32}")

#: Request fields that carry what somebody analysed.
_DROP_KEYS = frozenset(
    {"address", "url", "request", "query", "q", "subject", "summary", "api_key", "key"}
)


def _scrub_url(value: str) -> str:
    """Reduce a URL to its shape.

    `/api/v1/token/0xabc…` becomes `/api/v1/token/{address}`, which is both
    safer and more useful: without it, the same bug against a hundred tokens
    appears as a hundred separate issues and none of them looks urgent.
    """
    cleaned = _ADDRESS.sub("/{address}", value)
    cleaned = _HEX_ID.sub("/{id}", cleaned)
    return cleaned.split("?")[0]


def _scrub(event: Any, _hint: dict[str, Any]) -> Any:
    """Remove what somebody analysed, keep what broke."""
    request = event.get("request")
    if isinstance(request, dict):
        if isinstance(request.get("url"), str):
            request["url"] = _scrub_url(request["url"])
        # The body is where a free-form request lives. There is no version of
        # it that is safe to send, so it goes entirely.
        request.pop("data", None)
        request.pop("cookies", None)

        headers = request.get("headers")
        if isinstance(headers, dict):
            for name in list(headers):
                if name.lower() in ("authorization", "x-api-key", "cookie"):
                    headers[name] = "[redacted]"

        query = request.get("query_string")
        if query:
            request["query_string"] = "[redacted]"

    for container in ("extra", "tags", "contexts"):
        section = event.get(container)
        if isinstance(section, dict):
            for name in list(section):
                if name.lower() in _DROP_KEYS:
                    section[name] = "[redacted]"

    for crumb in event.get("breadcrumbs", {}).get("values", []) or []:
        if isinstance(crumb, dict) and isinstance(crumb.get("message"), str):
            crumb["message"] = _scrub_url(crumb["message"])

    return event


def setup() -> bool:
    """Start error tracking if a DSN is configured. Returns whether it did."""
    from app.config import get_settings

    settings = get_settings()
    dsn = settings.sentry_dsn.get_secret_value() if settings.sentry_dsn else ""
    if not dsn:
        return False

    try:
        import sentry_sdk
    except ImportError:
        # The package is optional. Saying so is more useful than a stack trace
        # about an import at startup.
        logger.warning("sentry_sdk_missing", detail="Install sentry-sdk to enable.")
        return False

    sentry_sdk.init(
        dsn=dsn,
        environment=settings.app_env,
        release=settings.app_version,
        # Sampled rather than everything: traces are the expensive part and a
        # tenth is plenty to see where time goes.
        traces_sample_rate=0.1,
        # Both default to sending request bodies and user identifiers. Neither
        # is acceptable here, and turning them off is cheaper than trusting the
        # scrubber to catch every path.
        send_default_pii=False,
        max_request_body_size="never",
        before_send=_scrub,
    )
    logger.info("sentry_enabled", environment=settings.app_env)
    return True
