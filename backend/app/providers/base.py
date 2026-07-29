"""The contract every capability provider satisfies.

Distinct from `services.BaseServiceClient`, and the distinction is worth
stating because the two look similar. A *service* is a named dependency this
platform reads a specific shape from — Blockscout returns token records and
nothing else does. A *provider* is interchangeable: four of them can answer
`WEB_SEARCH`, and the router picks whichever is healthy.

That interchangeability is the whole design. It is why providers declare
capabilities instead of methods, why `execute` takes a capability rather than
having one function per operation, and why a provider that cannot serve a
request returns a result saying so rather than raising.

Both layers share the same transport, so retries, timeouts, backoff, and
structured errors behave identically. Nothing is reimplemented here.
"""

from __future__ import annotations

import asyncio
import time
from abc import ABC, abstractmethod
from typing import Any, ClassVar

from pydantic import SecretStr

from app.core.exceptions import ServiceRateLimitError
from app.logging import get_logger
from app.providers.types import (
    Capability,
    ProviderHealth,
    ProviderResult,
    ProviderState,
    ProviderStatus,
)
from app.services.http import ResilientHTTPClient, RetryPolicy, TimeoutPolicy

logger = get_logger(__name__)

#: A health probe must be bounded, or one slow provider holds the whole status
#: page open for its full read timeout.
#:
#: Overridable per provider, because the floor is not the same for all of them:
#: a provider whose cheapest call *renders a page* legitimately takes seconds,
#: and a shared 8s ceiling marked Jina `unavailable` on a cold start when it was
#: answering fine a second later. A probe that reports a working provider as
#: down is worse than a probe that waits.
HEALTH_PROBE_TIMEOUT = 8.0

#: How long a rate-limit verdict sticks before the provider is tried again.
#: Long enough to stop hammering, short enough that a brief throttle does not
#: take a provider out of rotation for the rest of the process.
RATE_LIMIT_COOLDOWN_SECONDS = 120.0


class Provider(ABC):
    """One interchangeable capability source.

    Subclasses declare what they can do and implement `_perform`. Everything
    else — configuration checks, timing, rate-limit memory, error shaping — is
    handled here so no provider has to repeat it or get it subtly different.
    """

    #: Stable identifier. Appears in reports, logs, and the console.
    name: ClassVar[str]
    title: ClassVar[str]
    description: ClassVar[str]

    #: What this provider can be asked for. The router reads only this.
    capabilities: ClassVar[tuple[Capability, ...]] = ()

    #: Variables a deployment must set. Empty means the provider needs none.
    required_env: ClassVar[tuple[str, ...]] = ()

    #: True when the platform works fully without this provider. False would
    #: mean an analysis is incomplete without it; nothing here is that yet.
    optional: ClassVar[bool] = True

    #: Seconds a health probe may take. Raised by providers whose cheapest
    #: call is genuinely slow rather than by tuning the global ceiling up.
    probe_timeout: ClassVar[float] = HEALTH_PROBE_TIMEOUT

    def __init__(
        self,
        *,
        base_url: str = "",
        api_key: SecretStr | None = None,
        enabled: bool = True,
        retry: RetryPolicy | None = None,
        timeout: TimeoutPolicy | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._enabled = enabled
        self._retry = retry
        self._timeout = timeout

        #: Built on first use rather than in the constructor. A provider with
        #: no credential is never contacted, so it should never hold a
        #: connection pool either.
        self._http: ResilientHTTPClient | None = None
        self._lock = asyncio.Lock()

        self._last_health: ProviderHealth | None = None
        self._rate_limited_until = 0.0

    # --- configuration -----------------------------------------------------

    @property
    def has_credentials(self) -> bool:
        """Whether the credential is present — not whether it works."""
        if not self.required_env:
            return True
        return self._api_key is not None

    @property
    def is_available(self) -> bool:
        """Whether the router may route work here right now."""
        return self.state.is_usable

    @property
    def missing_env(self) -> tuple[str, ...]:
        """Only the variables that are actually unset.

        Distinct from `required_env`, which lists everything the provider
        needs. Reporting the full list would tell an operator to set a value
        they have already set — QStash needs a token *and* a callback URL, and
        with the token in place the remaining instruction is the URL alone.

        The default assumes one credential covers every requirement. A provider
        with several independent values overrides this.
        """
        return () if self.has_credentials else self.required_env

    @property
    def state(self) -> ProviderState:
        """Current state, without performing a probe.

        Ordered by precedence: an operator switching a provider off outranks a
        missing key, which outranks a throttle, which outranks whatever the
        last probe found.
        """
        if not self._enabled:
            return ProviderState.DISABLED
        if not self.has_credentials:
            return ProviderState.MISSING_KEY
        if time.monotonic() < self._rate_limited_until:
            return ProviderState.RATE_LIMITED
        if self._last_health is not None:
            return self._last_health.state
        return ProviderState.ENABLED

    def _unavailable_detail(self) -> str:
        """Why this provider cannot be used, in words an operator can act on."""
        state = self.state
        if state is ProviderState.DISABLED:
            return "Switched off by configuration."
        if state is ProviderState.MISSING_KEY:
            missing = ", ".join(self.missing_env or self.required_env)
            return f"Set {missing} in the environment to enable this provider."
        if state is ProviderState.RATE_LIMITED:
            remaining = max(0, int(self._rate_limited_until - time.monotonic()))
            return f"Rate limited upstream. Retrying in about {remaining}s."
        if self._last_health is not None:
            return self._last_health.detail
        return "Ready."

    # --- transport ---------------------------------------------------------

    async def http(self) -> ResilientHTTPClient:
        """The pooled client, created once on first real use."""
        if self._http is None:
            async with self._lock:
                if self._http is None:
                    self._http = ResilientHTTPClient(
                        service=self.name,
                        base_url=self.base_url,
                        headers=self.auth_headers(),
                        retry=self._retry,
                        timeout=self._timeout,
                    )
        return self._http

    def auth_headers(self) -> dict[str, str]:
        """Bearer by default. Overridden where a provider differs."""
        if self._api_key is None:
            return {}
        return {"authorization": f"Bearer {self._api_key.get_secret_value()}"}

    @property
    def key(self) -> str:
        """The raw credential, for providers that place it outside a header.

        Callers must never log or return this. Access is deliberately explicit
        so a review can grep for it.
        """
        return self._api_key.get_secret_value() if self._api_key else ""

    async def aclose(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None

    # --- lifecycle ---------------------------------------------------------

    async def initialize(self) -> ProviderHealth:
        """Prepare the provider and report what it found.

        Safe to call whether or not the provider is configured: an unconfigured
        one records its state and performs no I/O, which is what lets the
        application start with every key absent.
        """
        if not self.state.is_usable:
            health = ProviderHealth(state=self.state, detail=self._unavailable_detail())
            self._last_health = None if self.state is ProviderState.ENABLED else health
            return health

        return await self.health()

    async def health(self) -> ProviderHealth:
        """Probe the real dependency, bounded and never raising."""
        if not self._enabled:
            return ProviderHealth(ProviderState.DISABLED, self._unavailable_detail())
        if not self.has_credentials:
            return ProviderHealth(ProviderState.MISSING_KEY, self._unavailable_detail())

        started = time.perf_counter()
        try:
            async with asyncio.timeout(self.probe_timeout):
                detail = await self._probe()
        except TimeoutError:
            health = ProviderHealth(
                ProviderState.UNAVAILABLE,
                f"No response within {self.probe_timeout:.0f}s.",
                latency_ms=round((time.perf_counter() - started) * 1000, 1),
            )
        except ServiceRateLimitError:
            self.note_rate_limited()
            health = ProviderHealth(
                ProviderState.RATE_LIMITED,
                self._unavailable_detail(),
                latency_ms=round((time.perf_counter() - started) * 1000, 1),
            )
        except Exception as exc:
            health = ProviderHealth(
                ProviderState.UNAVAILABLE,
                f"{type(exc).__name__}: {exc}"[:200],
                latency_ms=round((time.perf_counter() - started) * 1000, 1),
            )
        else:
            health = ProviderHealth(
                ProviderState.HEALTHY,
                detail,
                latency_ms=round((time.perf_counter() - started) * 1000, 1),
            )

        self._last_health = health
        return health

    def note_rate_limited(self) -> None:
        """Remember a throttle so the router stops choosing this provider."""
        self._rate_limited_until = time.monotonic() + RATE_LIMIT_COOLDOWN_SECONDS
        logger.warning("provider_rate_limited", provider=self.name)

    def status(self) -> ProviderStatus:
        """Everything the console needs, with no probe and no secrets."""
        health = self._last_health
        return ProviderStatus(
            name=self.name,
            title=self.title,
            description=self.description,
            capabilities=self.capabilities,
            state=self.state,
            detail=self._unavailable_detail(),
            required_env=self.required_env,
            missing_env=self.missing_env,
            optional=self.optional,
            base_url=self.base_url or None,
            latency_ms=health.latency_ms if health else None,
            checked_at=health.checked_at if health else None,
            version=self.version,
        )

    @property
    def version(self) -> str | None:
        """The upstream API version this provider targets, where one is pinned.

        A string like `v2` is a fact about the code. Anything the provider does
        not actually publish is left as None rather than guessed.
        """
        return None

    # --- work --------------------------------------------------------------

    def supports(self, capability: Capability) -> bool:
        return capability in self.capabilities

    async def execute(self, capability: Capability, /, **kwargs: Any) -> ProviderResult:
        """Do one unit of work, returning a result rather than raising.

        This is the boundary the rest of the platform relies on. A provider
        that is missing, throttled, broken, or simply does not do this kind of
        work all produce a `ProviderResult` with `ok=False` — so a router
        driving four providers loses one, not the run.
        """
        if not self.supports(capability):
            return ProviderResult.failure(
                self.name,
                capability,
                f"{self.title} does not provide {capability.value}.",
                error_code="capability_unsupported",
            )

        if not self.state.is_usable:
            return ProviderResult.failure(
                self.name,
                capability,
                self._unavailable_detail(),
                error_code=self.state.value,
            )

        started = time.perf_counter()
        try:
            result = await self._perform(capability, **kwargs)
        except ServiceRateLimitError as exc:
            self.note_rate_limited()
            return ProviderResult.failure(
                self.name,
                capability,
                exc.message,
                error_code="rate_limited",
                duration_ms=int((time.perf_counter() - started) * 1000),
            )
        except Exception as exc:
            logger.warning(
                "provider_execute_failed",
                provider=self.name,
                capability=capability.value,
                error=str(exc),
            )
            return ProviderResult.failure(
                self.name,
                capability,
                f"{type(exc).__name__}: {exc}"[:300],
                duration_ms=int((time.perf_counter() - started) * 1000),
            )

        if result.duration_ms is None:
            result.duration_ms = int((time.perf_counter() - started) * 1000)
        return result

    # --- subclass surface --------------------------------------------------

    @abstractmethod
    async def _probe(self) -> str:
        """Cheapest call that proves the credential works. Returns a detail line."""

    @abstractmethod
    async def _perform(self, capability: Capability, /, **kwargs: Any) -> ProviderResult:
        """Do the work. Exceptions are caught and shaped by `execute`."""
