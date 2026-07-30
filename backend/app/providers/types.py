"""Shared vocabulary for the provider layer.

Kept apart from the provider base class so the API schemas, the manager, and
the router can all speak about provider state without importing the transport
machinery that performs the calls.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any

from app.models.base import utcnow


class ProviderState(StrEnum):
    """What a provider is currently able to do.

    Six states rather than a boolean, because the reasons a provider cannot
    serve a request are not interchangeable and the caller acts differently on
    each. `MISSING_KEY` is a deployment task; `RATE_LIMITED` clears on its own;
    `UNAVAILABLE` is somebody else's outage. Collapsing them would repeat the
    mistake the evidence model exists to prevent — an absence rendered as a
    verdict.
    """

    #: Configured, probed, and answering.
    HEALTHY = "healthy"
    #: Configured and enabled, but not probed yet this process.
    ENABLED = "enabled"
    #: No credential. The deployment has not been given what it needs.
    MISSING_KEY = "missing_key"
    #: Switched off by configuration, credential or not.
    DISABLED = "disabled"
    #: Reachable, but refusing requests for now. Clears without intervention.
    RATE_LIMITED = "rate_limited"
    #: Configured, probed, and not answering.
    UNAVAILABLE = "unavailable"

    @property
    def is_usable(self) -> bool:
        """Whether the router may send work here."""
        return self in (ProviderState.HEALTHY, ProviderState.ENABLED)


class Capability(StrEnum):
    """What a provider can be asked to do.

    The router selects on capability rather than on provider name, which is
    what lets a provider be added or removed without the router changing.
    """

    #: Ranked results for a natural-language query.
    WEB_SEARCH = "web_search"
    #: Meaning-based retrieval rather than keyword matching.
    SEMANTIC_SEARCH = "semantic_search"
    #: Recent items, ordered by time as much as relevance.
    NEWS_SEARCH = "news_search"
    #: Pages resembling a given page.
    SIMILAR_PAGES = "similar_pages"
    #: Text of a page returned alongside search results, saving a second call.
    SEARCH_WITH_CONTENT = "search_with_content"
    #: One URL to clean, readable text.
    READ_URL = "read_url"
    #: Several URLs read in one request. Not a loop over READ_URL: providers
    #: that offer it batch server-side and charge once.
    READ_MANY = "read_many"
    #: Every URL a site exposes, without fetching their contents. Cheap enough
    #: to run before deciding what is worth reading.
    MAP_SITE = "map_site"
    #: Many pages of a site, followed from a root.
    CRAWL_SITE = "crawl_site"
    #: Structured fields pulled out of a page.
    EXTRACT_STRUCTURED = "extract_structured"
    #: A rendered image of a page.
    SCREENSHOT = "screenshot"
    #: Run code and return what it produced.
    RUN_CODE = "run_code"
    #: Key/value storage with expiry.
    CACHE = "cache"
    #: Deferred and scheduled work.
    QUEUE = "queue"
    #: Product event capture.
    ANALYTICS = "analytics"


@dataclass(frozen=True, slots=True)
class ProviderHealth:
    """The outcome of one health probe."""

    state: ProviderState
    detail: str
    #: How long the probe took. None when no call was made — an unconfigured
    #: provider is never contacted, so reporting 0 ms would imply it answered.
    latency_ms: float | None = None
    checked_at: datetime = field(default_factory=utcnow)

    def to_dict(self) -> dict[str, Any]:
        return {
            "state": self.state.value,
            "detail": self.detail,
            "latency_ms": self.latency_ms,
            "checked_at": self.checked_at.isoformat(),
        }


@dataclass(frozen=True, slots=True)
class ProviderStatus:
    """Everything the console shows about one provider."""

    name: str
    title: str
    description: str
    capabilities: tuple[Capability, ...]
    state: ProviderState
    detail: str
    #: The variable a deployment sets to enable this. Named so the UI can tell
    #: the operator exactly what to add rather than "configure the provider".
    required_env: tuple[str, ...]
    #: The subset of `required_env` that is actually unset.
    missing_env: tuple[str, ...]
    optional: bool
    base_url: str | None = None
    latency_ms: float | None = None
    checked_at: datetime | None = None
    #: Set when the provider itself reports a version. Left absent rather than
    #: invented — a made-up version is worse than none.
    version: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "title": self.title,
            "description": self.description,
            "capabilities": [item.value for item in self.capabilities],
            "state": self.state.value,
            "detail": self.detail,
            "required_env": list(self.required_env),
            "missing_env": list(self.missing_env),
            "optional": self.optional,
            "base_url": self.base_url,
            "latency_ms": self.latency_ms,
            "checked_at": self.checked_at.isoformat() if self.checked_at else None,
            "version": self.version,
            "usable": self.state.is_usable,
        }


@dataclass(slots=True)
class ProviderResult:
    """What a provider hands back from `execute`.

    Never raises past the provider boundary. A failure is a result with
    `ok=False` and an `error`, so a router driving several providers can carry
    on with the ones that worked instead of losing the whole run to one
    outage.
    """

    provider: str
    capability: Capability
    ok: bool
    data: Any = None
    error: str | None = None
    error_code: str | None = None
    duration_ms: int | None = None
    #: Where the data came from, for the report's Sources section.
    citations: list[dict[str, Any]] = field(default_factory=list)
    #: Non-fatal notes: a truncated crawl, a partial page, a fallback used.
    warnings: list[str] = field(default_factory=list)

    @classmethod
    def success(
        cls,
        provider: str,
        capability: Capability,
        data: Any,
        *,
        citations: list[dict[str, Any]] | None = None,
        warnings: list[str] | None = None,
        duration_ms: int | None = None,
    ) -> ProviderResult:
        return cls(
            provider=provider,
            capability=capability,
            ok=True,
            data=data,
            citations=citations or [],
            warnings=warnings or [],
            duration_ms=duration_ms,
        )

    @classmethod
    def failure(
        cls,
        provider: str,
        capability: Capability,
        error: str,
        *,
        error_code: str = "provider_error",
        duration_ms: int | None = None,
    ) -> ProviderResult:
        return cls(
            provider=provider,
            capability=capability,
            ok=False,
            error=error,
            error_code=error_code,
            duration_ms=duration_ms,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "capability": self.capability.value,
            "ok": self.ok,
            "data": self.data,
            "error": self.error,
            "error_code": self.error_code,
            "duration_ms": self.duration_ms,
            "citations": self.citations,
            "warnings": self.warnings,
        }
