"""Service layer: transport resilience, credentials, and validation."""

from __future__ import annotations

import httpx
import pytest

from app.core.exceptions import (
    ConfigurationError,
    ServiceError,
    ServiceRateLimitError,
    ServiceResponseError,
    ServiceTimeoutError,
    ServiceUnavailableError,
    UpstreamNotFoundError,
)
from app.services.http import (
    ResilientHTTPClient,
    RetryPolicy,
    user_agent,
    validate_response,
)
from app.services.models import ChainStats, TokenInfo
from app.services.openrouter import OpenRouterClient
from app.services.registry import get_service_registry
from app.services.rpc import hex_to_int


def make_client(handler: httpx.MockTransport, **kwargs) -> ResilientHTTPClient:
    client = ResilientHTTPClient(
        service="test",
        base_url="https://svc.test",
        retry=kwargs.pop("retry", RetryPolicy(max_attempts=3, backoff_base_seconds=0.0)),
    )
    # Inject the mock transport in place of the real pooled client.
    client._client = httpx.AsyncClient(transport=handler, base_url="https://svc.test")
    return client


# --- Retry and backoff ------------------------------------------------------


async def test_retries_then_succeeds_on_500() -> None:
    attempts = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        attempts["n"] += 1
        if attempts["n"] < 3:
            return httpx.Response(500)
        return httpx.Response(200, json={"ok": True})

    client = make_client(httpx.MockTransport(handler))
    assert await client.get_json("/x") == {"ok": True}
    assert attempts["n"] == 3


async def test_gives_up_after_max_attempts() -> None:
    attempts = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        attempts["n"] += 1
        return httpx.Response(503)

    client = make_client(httpx.MockTransport(handler))

    with pytest.raises(ServiceUnavailableError):
        await client.get_json("/x")

    assert attempts["n"] == 3


async def test_does_not_retry_a_client_error() -> None:
    attempts = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        attempts["n"] += 1
        return httpx.Response(400, json={"bad": True})

    client = make_client(httpx.MockTransport(handler))

    with pytest.raises(ServiceError):
        await client.get_json("/x")

    assert attempts["n"] == 1, "400 is not transient and must not be retried"


async def test_404_becomes_upstream_not_found() -> None:
    client = make_client(httpx.MockTransport(lambda r: httpx.Response(404)))

    with pytest.raises(UpstreamNotFoundError) as excinfo:
        await client.get_json("/missing")

    assert excinfo.value.status_code == 404
    assert excinfo.value.suggested_action


async def test_rate_limit_surfaces_retry_after() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, headers={"retry-after": "1"})

    client = make_client(httpx.MockTransport(handler))

    with pytest.raises(ServiceRateLimitError) as excinfo:
        await client.get_json("/x")

    assert excinfo.value.details["retry_after"] == 1.0


async def test_timeout_becomes_service_timeout() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("too slow", request=request)

    client = make_client(httpx.MockTransport(handler))

    with pytest.raises(ServiceTimeoutError):
        await client.get_json("/x")


async def test_non_json_body_becomes_structured_error() -> None:
    client = make_client(
        httpx.MockTransport(lambda r: httpx.Response(200, text="<html>nope</html>"))
    )

    with pytest.raises(ServiceResponseError):
        await client.get_json("/x")


async def test_user_agent_is_set() -> None:
    """Both upstream hosts 403 the default client agent.

    Also that there is exactly one of these: the shared client and
    `WEB_USER_AGENT` used to be separate constants that drifted apart, so a
    site operator saw two different callers in their logs.
    """
    from app.config import get_settings

    assert "Molthood" in user_agent()
    assert user_agent() == get_settings().web_user_agent

    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["ua"] = request.headers.get("user-agent", "")
        return httpx.Response(200, json={})

    client = ResilientHTTPClient(service="test", base_url="https://svc.test")
    client._client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://svc.test",
        headers=client._headers,
    )
    await client.get_json("/x")

    assert captured["ua"] == user_agent()


# --- Response validation ----------------------------------------------------


def test_validation_tolerates_unknown_upstream_fields() -> None:
    model = validate_response(
        {"name": "T", "symbol": "T", "brand_new_field": 1},
        TokenInfo,
        service="blockscout",
    )
    assert model.symbol == "T"


def test_validation_rejects_wrong_shape() -> None:
    with pytest.raises(ServiceResponseError):
        validate_response(
            {"gas_prices": "not-an-object"}, ChainStats, service="blockscout"
        )


def test_hex_parsing() -> None:
    assert hex_to_int("0x1237") == 4663
    assert hex_to_int("not-hex") is None
    assert hex_to_int(None) is None


# --- Credentials ------------------------------------------------------------


async def test_unconfigured_client_raises_configuration_error() -> None:
    client = OpenRouterClient(
        base_url="https://openrouter.test", model="test/model", api_key=None
    )

    with pytest.raises(ConfigurationError) as excinfo:
        await client.summarize(system_prompt="s", user_prompt="u")

    assert "OPENROUTER_API_KEY" in excinfo.value.suggested_action


def test_api_key_never_appears_in_describe() -> None:
    from pydantic import SecretStr

    client = OpenRouterClient(
        base_url="https://openrouter.test",
        model="test/model",
        api_key=SecretStr("sk-super-secret"),
    )
    described = repr(client.describe())

    assert "sk-super-secret" not in described
    assert described.count("api_key_present") == 1


def test_registry_exposes_all_four_services() -> None:
    names = {client.service.value for client in get_service_registry().list()}

    assert names == {"robinhood_rpc", "blockscout", "codex", "openrouter"}
