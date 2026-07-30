"""The provider manager.

Builds every provider from settings, probes them, caches what it found, and
answers the one question the router actually asks: *which providers can serve
this capability right now, best first*.

Construction opens no sockets and requires no credentials. That is the
property the whole design turns on — the application starts identically with
every key absent, and adding a key plus a restart is the only step needed to
bring a provider into rotation.
"""

from __future__ import annotations

import asyncio
import time
from functools import lru_cache
from typing import Any

from app.config import Settings, get_settings
from app.logging import get_logger
from app.providers.base import Provider
from app.providers.e2b.provider import E2BProvider
from app.providers.exa.provider import ExaProvider
from app.providers.firecrawl.provider import FirecrawlProvider
from app.providers.jina.provider import JinaProvider
from app.providers.posthog.provider import PostHogProvider
from app.providers.tavily.provider import TavilyProvider
from app.providers.types import Capability, ProviderState, ProviderStatus
from app.providers.upstash.cache import UpstashRedisProvider
from app.providers.upstash.queue import QStashProvider
from app.services.http import RetryPolicy, TimeoutPolicy

logger = get_logger(__name__)

#: Probes are cached so repeated status polls do not re-contact every provider.
HEALTH_CACHE_SECONDS = 30.0

#: Preference order per capability, best first.
#:
#: This table *is* the routing policy, and it is data rather than code so a new
#: provider is one entry rather than a change to the router. Order encodes cost
#: and fit, not just ability: Jina reads a page for free, so it goes before
#: Firecrawl, which renders in a browser and bills for it. The router falls
#: through this list until one provider is usable.
PREFERENCE: dict[Capability, tuple[str, ...]] = {
    Capability.WEB_SEARCH: ("exa", "tavily", "firecrawl"),
    Capability.SEMANTIC_SEARCH: ("exa",),
    Capability.NEWS_SEARCH: ("tavily",),
    Capability.SIMILAR_PAGES: ("exa",),
    # Jina first: it needs no key and costs nothing, so a keyless deployment
    # can still read a page.
    Capability.READ_URL: ("jina", "firecrawl", "exa", "tavily"),
    # Exa alone: it fetches the whole batch server-side and bills once, so a
    # loop over READ_URL is not an equivalent fallback — it is the same work
    # at many times the cost.
    Capability.READ_MANY: ("exa",),
    # Text arrives with the results, collapsing search-then-fetch into one
    # call. Ordered ahead of plain WEB_SEARCH wherever a caller needs bodies.
    Capability.SEARCH_WITH_CONTENT: ("exa", "tavily"),
    # Mapping returns a site's URLs without rendering any of them, which is
    # why it precedes crawling rather than competing with it.
    Capability.MAP_SITE: ("firecrawl",),
    Capability.CRAWL_SITE: ("firecrawl",),
    Capability.EXTRACT_STRUCTURED: ("firecrawl",),
    Capability.SCREENSHOT: ("firecrawl",),
    Capability.RUN_CODE: ("e2b",),
    Capability.ANALYSE_DATA: ("e2b",),
    Capability.CACHE: ("upstash_redis",),
    Capability.QUEUE: ("upstash_qstash",),
    Capability.ANALYTICS: ("posthog",),
}


class ProviderManager:
    """Owns every provider instance and reports on them."""

    def __init__(self, settings: Settings | None = None) -> None:
        config = settings or get_settings()

        retry = RetryPolicy(max_attempts=config.http_max_attempts)
        timeout = TimeoutPolicy(
            connect_seconds=config.http_connect_timeout,
            read_seconds=config.http_read_timeout,
        )
        shared: dict[str, Any] = {"retry": retry, "timeout": timeout}

        self.exa = ExaProvider(
            base_url=config.exa_base_url,
            api_key=config.exa_api_key,
            enabled=config.providers_enabled,
            **shared,
        )
        self.tavily = TavilyProvider(
            base_url=config.tavily_base_url,
            api_key=config.tavily_api_key,
            enabled=config.providers_enabled,
            **shared,
        )
        self.jina = JinaProvider(
            base_url=config.jina_reader_url,
            api_key=config.jina_api_key,
            enabled=config.providers_enabled,
            retry=retry,
        )
        self.firecrawl = FirecrawlProvider(
            base_url=config.firecrawl_base_url,
            api_key=config.firecrawl_api_key,
            enabled=config.providers_enabled,
            retry=retry,
        )
        self.e2b = E2BProvider(
            api_key=config.e2b_api_key,
            template=config.e2b_template,
            enabled=config.providers_enabled,
            **shared,
        )
        self.redis = UpstashRedisProvider(
            base_url=config.upstash_redis_rest_url,
            api_key=config.upstash_redis_rest_token,
            enabled=config.providers_enabled,
            **shared,
        )
        self.qstash = QStashProvider(
            base_url=config.qstash_base_url,
            api_key=config.qstash_token,
            callback_base_url=config.qstash_callback_base_url,
            enabled=config.providers_enabled,
            **shared,
        )
        self.posthog = PostHogProvider(
            base_url=config.posthog_host,
            api_key=config.posthog_api_key,
            enabled=config.providers_enabled and config.analytics_enabled,
            **shared,
        )

        self._providers: dict[str, Provider] = {
            provider.name: provider
            for provider in (
                self.exa,
                self.tavily,
                self.jina,
                self.firecrawl,
                self.e2b,
                self.redis,
                self.qstash,
                self.posthog,
            )
        }

        self._probed_at = 0.0
        self._initialised = False

    # --- discovery ---------------------------------------------------------

    def get(self, name: str) -> Provider | None:
        return self._providers.get(name)

    def all(self) -> list[Provider]:
        return list(self._providers.values())

    def for_capability(self, capability: Capability) -> list[Provider]:
        """Usable providers for this capability, best first.

        Preference order is applied first, then anything else that declares the
        capability — so a provider added without a preference entry still works,
        just at the back of the queue.
        """
        preferred = PREFERENCE.get(capability, ())
        ordered: list[Provider] = []

        for name in preferred:
            provider = self._providers.get(name)
            if provider and provider.supports(capability) and provider.is_available:
                ordered.append(provider)

        for provider in self._providers.values():
            if (
                provider.name not in preferred
                and provider.supports(capability)
                and provider.is_available
            ):
                ordered.append(provider)

        return ordered

    def best_for(self, capability: Capability) -> Provider | None:
        candidates = self.for_capability(capability)
        return candidates[0] if candidates else None

    def missing_for(self, capability: Capability) -> list[str]:
        """Variables that would enable a capability nothing can currently serve.

        The console turns this into "set these to unlock X" rather than an
        unexplained empty section.
        """
        missing: list[str] = []
        for name in PREFERENCE.get(capability, ()):
            provider = self._providers.get(name)
            if provider and provider.state is ProviderState.MISSING_KEY:
                missing.extend(provider.missing_env)
        return missing

    # --- lifecycle ---------------------------------------------------------

    async def initialize(self) -> dict[str, str]:
        """Probe everything in parallel. Never raises, whatever is configured.

        Called at startup. A provider that fails here is recorded as
        unavailable and the application carries on — which is what lets a
        deployment start with a wrong key, a dead upstream, or no keys at all.
        """
        results = await asyncio.gather(
            *(provider.initialize() for provider in self._providers.values()),
            return_exceptions=True,
        )

        summary: dict[str, str] = {}
        for provider, outcome in zip(self._providers.values(), results, strict=True):
            if isinstance(outcome, BaseException):
                summary[provider.name] = ProviderState.UNAVAILABLE.value
                logger.warning(
                    "provider_init_failed",
                    provider=provider.name,
                    error=str(outcome),
                )
                continue
            summary[provider.name] = outcome.state.value

        self._probed_at = time.monotonic()
        self._initialised = True

        usable = [
            name for name, state in summary.items() if ProviderState(state).is_usable
        ]
        logger.info(
            "providers_initialized",
            total=len(summary),
            usable=len(usable),
            available=usable,
        )
        return summary

    async def refresh(self, *, force: bool = False) -> None:
        """Re-probe, at most once per cache window."""
        if not force and time.monotonic() - self._probed_at < HEALTH_CACHE_SECONDS:
            return

        await asyncio.gather(
            *(provider.health() for provider in self._providers.values()),
            return_exceptions=True,
        )
        self._probed_at = time.monotonic()

    async def aclose(self) -> None:
        await asyncio.gather(
            *(provider.aclose() for provider in self._providers.values()),
            return_exceptions=True,
        )

    # --- reporting ---------------------------------------------------------

    def statuses(self) -> list[ProviderStatus]:
        """Every provider, in a stable order the console can rely on."""
        return [provider.status() for provider in self._providers.values()]

    def snapshot(self) -> dict[str, Any]:
        """The whole picture, for `/api/health` and the console."""
        statuses = self.statuses()
        usable = [item for item in statuses if item.state.is_usable]

        capabilities: dict[str, dict[str, Any]] = {}
        for capability in Capability:
            serving = [provider.name for provider in self.for_capability(capability)]
            capabilities[capability.value] = {
                "available": bool(serving),
                "providers": serving,
                "enable_with": self.missing_for(capability) if not serving else [],
            }

        return {
            "initialized": self._initialised,
            "total": len(statuses),
            "usable": len(usable),
            "providers": [item.to_dict() for item in statuses],
            "capabilities": capabilities,
            # Named separately because a caller almost always wants to know
            # whether the cache is shared before it decides to trust it.
            "cache_backend": self.redis.backend,
        }


@lru_cache(maxsize=1)
def get_provider_manager() -> ProviderManager:
    return ProviderManager()
