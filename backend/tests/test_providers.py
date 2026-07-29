"""The capability provider layer.

One property matters more than any other here and most of these tests guard
it: **the application is fully functional with zero credentials**. It starts,
it reports what is missing, it routes around what is absent, and it never
crashes because a key is not set. Adding a key and restarting is the only step
that should ever be required.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.exceptions import ServiceRateLimitError
from app.providers.base import Provider
from app.providers.manager import PREFERENCE, ProviderManager
from app.providers.types import Capability, ProviderResult, ProviderState
from app.providers.upstash.cache import MemoryCache, UpstashRedisProvider
from app.providers.workflows import TaskKind, classify, plan


@pytest.fixture
def manager() -> ProviderManager:
    """A manager built exactly as a keyless deployment builds it."""
    return ProviderManager()


# --- Starting with nothing configured --------------------------------------


def test_every_provider_builds_without_credentials(manager: ProviderManager) -> None:
    """Construction must open no sockets and demand no keys.

    This is the property that lets the application start on a machine where
    nothing has been configured yet.
    """
    assert len(manager.all()) == 8


def test_an_unconfigured_provider_names_its_own_variable(
    manager: ProviderManager,
) -> None:
    """ "Provider unavailable" is useless; "set EXA_API_KEY" is actionable."""
    status = manager.exa.status()

    assert status.state is ProviderState.MISSING_KEY
    assert "EXA_API_KEY" in status.detail
    assert status.required_env == ("EXA_API_KEY",)


def test_a_status_never_carries_a_secret() -> None:
    """Only whether a key is present, never the key."""
    provider = ProviderManager()
    provider.exa._api_key = SecretStr("exa-secret-value")

    rendered = str(provider.exa.status().to_dict())

    assert "exa-secret-value" not in rendered


async def test_initialization_survives_every_provider_failing(
    manager: ProviderManager, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Startup must not depend on any upstream being reachable."""

    async def explode(self: Provider) -> str:
        raise RuntimeError("upstream is down")

    for provider in manager.all():
        monkeypatch.setattr(type(provider), "_probe", explode, raising=False)

    summary = await manager.initialize()

    assert len(summary) == 8
    # Nothing raised; every provider has a state.
    assert all(isinstance(state, str) for state in summary.values())


# --- Degrading rather than failing ------------------------------------------


async def test_an_unconfigured_provider_returns_a_result_not_an_exception(
    manager: ProviderManager,
) -> None:
    """The boundary the whole platform relies on.

    A router driving four providers must lose one to a missing key, not lose
    the run to an exception.
    """
    result = await manager.exa.execute(Capability.WEB_SEARCH, query="anything")

    assert isinstance(result, ProviderResult)
    assert result.ok is False
    assert result.error_code == "missing_key"
    assert "EXA_API_KEY" in (result.error or "")


async def test_asking_a_provider_for_something_it_does_not_do(
    manager: ProviderManager,
) -> None:
    result = await manager.jina.execute(Capability.RUN_CODE, code="print(1)")

    assert result.ok is False
    assert result.error_code == "capability_unsupported"


async def test_an_upstream_exception_becomes_a_failed_result(
    manager: ProviderManager, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A provider that throws must not throw past its own boundary."""

    async def explode(self: Any, capability: Capability, /, **kwargs: Any) -> Any:
        raise RuntimeError("connection reset")

    monkeypatch.setattr(type(manager.jina), "_perform", explode)

    result = await manager.jina.execute(Capability.READ_URL, url="https://example.com")

    assert result.ok is False
    assert "connection reset" in (result.error or "")


async def test_a_throttled_provider_leaves_rotation_and_says_why(
    manager: ProviderManager, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A rate limit is not an outage and not a missing key.

    It clears on its own, so it gets its own state — and the router stops
    choosing the provider until it does.
    """

    async def throttled(self: Any, capability: Capability, /, **kwargs: Any) -> Any:
        raise ServiceRateLimitError("slow down")

    monkeypatch.setattr(type(manager.jina), "_perform", throttled)

    result = await manager.jina.execute(Capability.READ_URL, url="https://example.com")

    assert result.error_code == "rate_limited"
    assert manager.jina.state is ProviderState.RATE_LIMITED
    assert manager.jina.is_available is False
    assert "Retrying in about" in manager.jina.status().detail


# --- The keyless deployment still works -------------------------------------


def test_a_page_can_still_be_read_with_no_keys_at_all(
    manager: ProviderManager,
) -> None:
    """Jina needs no credential, which is the whole reason it is preferred for
    a plain read: a deployment with nothing configured can still do something
    useful."""
    assert manager.jina.state is ProviderState.ENABLED
    assert manager.best_for(Capability.READ_URL) is manager.jina


def test_search_is_unavailable_but_names_its_remedy(
    manager: ProviderManager,
) -> None:
    assert manager.best_for(Capability.WEB_SEARCH) is None
    assert "EXA_API_KEY" in manager.missing_for(Capability.WEB_SEARCH)


def test_workflows_that_need_no_key_are_still_runnable(
    manager: ProviderManager,
) -> None:
    """The demonstration that graceful degradation is real.

    A website audit runs on Jina alone; the paid steps are reported as skipped
    rather than silently omitted.
    """
    resolved = plan(TaskKind.WEBSITE_AUDIT, manager)

    assert resolved.runnable
    assert len(resolved.active_steps) == 1
    skipped = [step for step in resolved.steps if step.provider is None]
    assert skipped
    assert all(step.skipped_because for step in skipped)


def test_a_blocked_workflow_says_what_would_unblock_it(
    manager: ProviderManager,
) -> None:
    resolved = plan(TaskKind.RESEARCH, manager)

    assert resolved.runnable is False
    assert "EXA_API_KEY" in resolved.blocked_by


def test_a_skipped_step_is_reported_rather_than_omitted(
    manager: ProviderManager,
) -> None:
    """A report that hid its skipped steps could not be checked — a reader
    could not tell thorough coverage from a missing key."""
    resolved = plan(TaskKind.RESEARCH, manager)

    assert len(resolved.steps) == 4
    for step in resolved.steps:
        assert step.provider is not None or step.skipped_because


# --- Routing ----------------------------------------------------------------


@pytest.mark.parametrize(
    ("request_text", "expected"),
    [
        ("research the history of stablecoin depegs", TaskKind.RESEARCH),
        ("audit https://robinhood.com", TaskKind.WEBSITE_AUDIT),
        ("https://github.com/pallets/flask", TaskKind.REPOSITORY_ANALYSIS),
        ("plot a chart of these numbers", TaskKind.CODE_EXECUTION),
        ("what is a proxy contract", TaskKind.QUESTION),
    ],
)
def test_requests_route_to_the_right_workflow(
    request_text: str, expected: TaskKind
) -> None:
    """Classification is rule-based on purpose: it runs before any provider is
    chosen, so it has to work on a deployment with no keys at all."""
    assert classify(request_text) == expected


def test_a_repository_url_beats_the_generic_url_rule() -> None:
    """Order matters — a GitHub link is a URL, but it is a repository first."""
    assert classify("https://github.com/pallets/flask") is TaskKind.REPOSITORY_ANALYSIS


def test_every_capability_has_a_preference_entry() -> None:
    """A capability with no preference would silently route to whatever
    happened to be first in the dictionary."""
    for capability in Capability:
        assert capability in PREFERENCE, capability


def test_a_free_provider_is_preferred_over_a_billed_one() -> None:
    """Jina reads a page for nothing; Firecrawl renders it and charges. The
    order encodes cost, not just ability."""
    order = PREFERENCE[Capability.READ_URL]

    assert order.index("jina") < order.index("firecrawl")


# --- Cache ------------------------------------------------------------------


def test_the_cache_falls_back_to_memory_with_no_credentials() -> None:
    provider = UpstashRedisProvider()

    assert provider.backend == "memory"


def test_the_cache_needs_both_halves() -> None:
    """A URL with no token is as good as neither, and must not look configured."""
    provider = UpstashRedisProvider(base_url="https://example.upstash.io")

    assert provider.has_credentials is False
    assert provider.backend == "memory"


async def test_the_cache_round_trips_types_not_just_strings() -> None:
    """Everything is stored as JSON so an integer comes back an integer."""
    provider = UpstashRedisProvider()

    await provider.set("count", 42, ttl_seconds=60)
    await provider.set("record", {"a": [1, 2]}, ttl_seconds=60)

    assert await provider.get("count") == 42
    assert await provider.get("record") == {"a": [1, 2]}


async def test_namespaces_do_not_collide() -> None:
    provider = UpstashRedisProvider()

    await provider.set("key", "one", namespace="a")
    await provider.set("key", "two", namespace="b")

    assert await provider.get("key", namespace="a") == "one"
    assert await provider.get("key", namespace="b") == "two"


async def test_invalidating_a_namespace_leaves_others_alone() -> None:
    provider = UpstashRedisProvider()
    await provider.set("x", 1, namespace="a")
    await provider.set("y", 2, namespace="a")
    await provider.set("z", 3, namespace="b")

    removed = await provider.invalidate(namespace="a")

    assert removed == 2
    assert await provider.get("z", namespace="b") == 3


async def test_cache_produces_on_a_miss_and_reuses_on_a_hit() -> None:
    provider = UpstashRedisProvider()
    calls = 0

    def produce() -> int:
        nonlocal calls
        calls += 1
        return 7

    assert await provider.cache("k", produce, ttl_seconds=60) == 7
    assert await provider.cache("k", produce, ttl_seconds=60) == 7
    assert calls == 1


async def test_a_failed_write_is_reported_rather_than_swallowed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The bug this test exists for.

    Against real Redis every `set` returned 400 and every `get` returned None,
    and the cache reported nothing — a permanent miss whose only symptom was
    slowness. Degrading quietly is right; degrading *invisibly* is not, so a
    failed write returns False and logs.
    """
    provider = UpstashRedisProvider(
        base_url="https://example.upstash.io", api_key=SecretStr("token")
    )

    async def broken(*args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("ERR syntax error")

    monkeypatch.setattr(provider, "_command", broken)

    assert await provider.set("k", 1) is False
    # A read still degrades to a miss, because the caller's remedy is the same.
    assert await provider.get("k") is None


def test_a_value_containing_slashes_survives() -> None:
    """Why commands are sent as a JSON array rather than in the URL path.

    Upstash's path form puts arguments in the URL, so any JSON value — which
    is full of slashes and quotes — would be mangled or rejected.
    """
    from app.providers.upstash.cache import _decode, _encode

    value = {"url": "https://a.example/b?c=d&e=/f", "list": [1, 2]}

    assert _decode(_encode(value)) == value


def test_an_expired_entry_is_a_miss() -> None:
    cache = MemoryCache()
    cache.set("k", "v", ttl_seconds=0)

    assert cache.get("k") is None
    assert cache.ttl("k") is None


def test_the_memory_cache_is_bounded() -> None:
    """An unbounded dictionary in a long-lived process is a leak."""
    cache = MemoryCache(max_entries=10)

    for index in range(50):
        cache.set(f"k{index}", "v", ttl_seconds=60)

    assert len(cache._entries) <= 10


# --- Analytics never affects a request --------------------------------------


async def test_analytics_is_silent_when_unconfigured() -> None:
    """Measurement must never be able to fail the thing it measures."""
    from app.providers.posthog.provider import PostHogProvider

    provider = PostHogProvider()

    # Returns None and raises nothing, with no key and no network.
    assert await provider.capture("execution_started") is None
    assert await provider.execution_failed("x", target="token", error="boom") is None
    assert await provider.flush() is None


# --- Queue refuses rather than discards -------------------------------------


async def test_the_queue_refuses_without_a_callback_url() -> None:
    """QStash delivers by calling a public URL back.

    A queue that accepted and silently discarded would be worse than one that
    declines, so a token with no callback base is reported as unusable.
    """
    from app.providers.upstash.queue import QStashProvider

    provider = QStashProvider(api_key=SecretStr("token"), callback_base_url="")
    result = await provider.publish(path="/hooks/run", body={})

    assert result.ok is False
    assert "QSTASH_CALLBACK_BASE_URL" in (result.error or "")


def test_a_queue_that_cannot_deliver_is_not_reported_as_usable() -> None:
    """The bug this test exists for.

    With a token and no callback URL the provider reported `enabled` and
    `is_available = True`, so the router would have routed queue work to
    something that refuses every publish. The detail string said the right
    thing; the *state* did not, and the router reads state.

    Same failure as a cache reporting `healthy` while dropping every write.
    """
    from app.providers.upstash.queue import QStashProvider

    provider = QStashProvider(api_key=SecretStr("token"), callback_base_url="")

    assert provider.state is ProviderState.MISSING_KEY
    assert provider.is_available is False
    assert "QSTASH_CALLBACK_BASE_URL" in provider.status().detail


def test_a_fully_configured_queue_is_usable() -> None:
    from app.providers.upstash.queue import QStashProvider

    provider = QStashProvider(
        api_key=SecretStr("token"), callback_base_url="https://molthood.xyz"
    )

    assert provider.state is ProviderState.ENABLED
    assert provider.is_available is True


# --- Over the wire ----------------------------------------------------------


def test_health_reports_missing_keys_without_a_credential(
    anonymous_client: TestClient,
) -> None:
    """Readable unauthenticated on purpose: an operator diagnosing a missing
    key should not need a key to see that it is missing."""
    response = anonymous_client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert "EXA_API_KEY" in body["missing_keys"]
    assert body["cache_backend"] == "memory"


def test_a_missing_key_does_not_make_the_platform_degraded(
    anonymous_client: TestClient,
) -> None:
    """`degraded` means something that was working stopped.

    A provider with no key was never expected to work here, so reporting
    degraded would mark every fresh deployment as broken.
    """
    response = anonymous_client.get("/api/health")

    assert response.json()["status"] == "ok"


def test_health_says_which_storage_is_actually_answering(
    anonymous_client: TestClient,
) -> None:
    """A deployment that stores nothing must not look identical to one that does.

    Startup tolerates a missing database on purpose — an analysis works without
    one. The cost is a service that answers every probe and silently discards
    every run, and this field is where that becomes visible.
    """
    database = anonymous_client.get("/api/health").json()["database"]

    assert database["reachable"] is True
    assert database["dialect"] == "sqlite"
    # SQLite on a container filesystem dies with the container. It errors
    # nowhere; it just forgets.
    assert database["ephemeral"] is True


def test_an_unreachable_database_degrades_the_platform(
    anonymous_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Unlike a missing provider key, this is not a deployment still to finish.

    Nothing is stored, no history exists, and every spend check passes for want
    of a table to read.
    """
    from app.api import system

    monkeypatch.setattr(
        system,
        "_database_health",
        lambda: {
            "reachable": False,
            "dialect": None,
            "detail": "OperationalError: connection refused",
            "ephemeral": None,
        },
    )

    assert anonymous_client.get("/api/health").json()["status"] == "degraded"


def test_a_connection_error_cannot_publish_the_database_password() -> None:
    """`/api/health` is unauthenticated, and a driver may quote the DSN it was
    handed. Observed failures do not — but that is not a property worth
    trusting on a public endpoint."""
    from app.api.system import _scrub_credentials

    scrubbed = _scrub_credentials(
        "OperationalError: postgresql+psycopg://molthood:hunter2@host:5432/railway"
    )

    assert "hunter2" not in scrubbed
    assert "molthood:" not in scrubbed
    # Still says which host failed, or the field would be useless.
    assert "host:5432/railway" in scrubbed


def test_liveness_stays_flat_regardless_of_providers(
    anonymous_client: TestClient,
) -> None:
    """`/health` is probed by orchestrators. If it reported degraded because a
    provider lacked a key, a healthy process would be restarted — which fixes
    nothing and drops live requests."""
    response = anonymous_client.get("/health")

    assert response.status_code == 200
    assert "providers" not in response.json()


def test_the_plan_endpoint_shows_routing_without_executing(
    anonymous_client: TestClient, settings: Any
) -> None:
    response = anonymous_client.get(
        f"{settings.api_prefix}/providers/plan",
        params={"request": "research the history of stablecoin depegs"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["classified_as"] == "research"
    assert body["plan"]["runnable"] is False
    assert "EXA_API_KEY" in body["plan"]["blocked_by"]
