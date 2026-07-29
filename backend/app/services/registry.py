"""Service client registry.

Builds one client per integration from settings and hands them to agents and
the evidence collector. Construction opens no sockets — the pooled HTTP client
inside each service is created on first use.
"""

from __future__ import annotations

import asyncio
import time
from functools import lru_cache
from typing import Any

from app.config import get_settings
from app.core.exceptions import NotFoundError
from app.logging import get_logger
from app.models.enums import ServiceName
from app.services.base import BaseServiceClient
from app.services.blockscout import BlockscoutClient
from app.services.codex import CodexClient
from app.services.http import RetryPolicy, TimeoutPolicy
from app.services.openrouter import OpenRouterClient
from app.services.rpc import RPCClient

logger = get_logger(__name__)

#: Upper bound on a single dependency health probe. Generous enough for a cold
#: explorer response, bounded so `/status` can never hang on one slow upstream.
HEALTH_PROBE_TIMEOUT = 9.0

#: Health is cached briefly so repeated dashboard polls do not re-probe every
#: dependency on every request.
HEALTH_CACHE_SECONDS = 15.0


class ServiceRegistry:
    """Holds one client instance per service."""

    def __init__(self) -> None:
        settings = get_settings()

        retry = RetryPolicy(max_attempts=settings.http_max_attempts)
        timeout = TimeoutPolicy(
            connect_seconds=settings.http_connect_timeout,
            read_seconds=settings.http_read_timeout,
        )

        self.rpc = RPCClient(base_url=settings.robinhood_rpc_url, retry=retry)
        self.blockscout = BlockscoutClient(
            base_url=settings.blockscout_base_url, retry=retry, timeout=timeout
        )
        self.codex = CodexClient(
            base_url=settings.codex_base_url,
            api_key=settings.codex_api_key,
            retry=retry,
            timeout=timeout,
        )
        self.openrouter = OpenRouterClient(
            base_url=settings.openrouter_base_url,
            model=settings.openrouter_model,
            api_key=settings.openrouter_api_key,
            retry=retry,
        )

        self._services: dict[ServiceName, BaseServiceClient] = {
            ServiceName.ROBINHOOD_RPC: self.rpc,
            ServiceName.BLOCKSCOUT: self.blockscout,
            ServiceName.CODEX: self.codex,
            ServiceName.OPENROUTER: self.openrouter,
        }

        self._health_cache: dict[str, dict[str, Any]] | None = None
        self._health_checked_at = 0.0

    def get(self, name: ServiceName) -> BaseServiceClient:
        client = self._services.get(name)
        if client is None:
            raise NotFoundError(
                f"No service client registered for '{name.value}'.",
                details={"service": name.value},
            )
        return client

    def list(self) -> list[BaseServiceClient]:
        return [self._services[name] for name in ServiceName if name in self._services]

    async def health(self, *, force: bool = False) -> dict[str, dict[str, Any]]:
        """Probe every configured dependency in parallel.

        Unconfigured services are reported as such without being called, so a
        missing API key never looks like an outage. Results are cached for
        `HEALTH_CACHE_SECONDS`; pass `force=True` to bypass the cache.
        """
        now = time.monotonic()
        if (
            not force
            and self._health_cache is not None
            and now - self._health_checked_at < HEALTH_CACHE_SECONDS
        ):
            return self._health_cache

        async def probe(client: BaseServiceClient) -> tuple[str, dict[str, Any]]:
            if not client.is_configured:
                return client.service.value, {
                    "state": "not_configured",
                    "detail": f"Set {client.api_key_env} to enable this service.",
                }
            try:
                # A health check must be bounded: a slow upstream must not be
                # able to hold the status endpoint open for its full timeout.
                async with asyncio.timeout(HEALTH_PROBE_TIMEOUT):
                    await client.ping()
            except TimeoutError:
                return client.service.value, {
                    "state": "unavailable",
                    "detail": f"No response within {HEALTH_PROBE_TIMEOUT}s.",
                }
            except Exception as exc:
                return client.service.value, {
                    "state": "unavailable",
                    "detail": type(exc).__name__,
                }
            return client.service.value, {"state": "live", "detail": "Responding."}

        results = await asyncio.gather(*(probe(c) for c in self.list()))
        self._health_cache = dict(results)
        self._health_checked_at = time.monotonic()
        return self._health_cache

    async def aclose(self) -> None:
        await asyncio.gather(
            *(client.aclose() for client in self._services.values()),
            return_exceptions=True,
        )


@lru_cache(maxsize=1)
def get_service_registry() -> ServiceRegistry:
    return ServiceRegistry()
