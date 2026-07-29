"""Versioned API endpoints.

These use the real app, so the handful that reach the chain are marked `live`.
Everything else asserts contract shape without network access.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

TOKEN = "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34"


def test_agents_report_live_registry_state(client: TestClient, settings) -> None:
    response = client.get(f"{settings.api_prefix}/agents")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 9
    assert body["implemented"] == 6

    implemented = {a["kind"] for a in body["items"] if a["implemented"]}
    assert implemented == {"market", "contract", "project", "risk", "site", "portfolio"}

    # No fabricated metrics may appear now that the console shows this as live.
    for item in body["items"]:
        assert "total_executions" not in item
        assert "success_rate" not in item


def test_unknown_agent_returns_structured_error(client: TestClient, settings) -> None:
    response = client.get(f"{settings.api_prefix}/agents/nope")

    assert response.status_code == 404
    error = response.json()["error"]
    assert error["code"] == "not_found"
    assert error["suggested_action"]


def test_pipelines_expose_the_five_stages(client: TestClient, settings) -> None:
    body = client.get(f"{settings.api_prefix}/pipelines").json()

    assert body["items"][0]["stages"] == [
        "input",
        "agents",
        "engine",
        "evidence",
        "report",
    ]


def test_executions_start_empty_and_declare_durability(
    client: TestClient, settings
) -> None:
    """History is durable now, and the response must say which it is.

    This asserted "in-memory" while that was true. Leaving it would have let
    the endpoint keep describing storage it no longer uses.
    """
    body = client.get(f"{settings.api_prefix}/executions").json()

    assert body["items"] == []
    assert "durable" in body["persistence"].lower()
    assert body["stats"]["total"] == 0


def test_invalid_address_is_rejected_before_any_call(
    client: TestClient, settings
) -> None:
    response = client.get(f"{settings.api_prefix}/token/not-an-address")

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert "0x" in error["suggested_action"]


def test_execute_rejects_empty_request(client: TestClient, settings) -> None:
    response = client.post(f"{settings.api_prefix}/execute", json={"request": ""})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_execute_reports_unroutable_text(client: TestClient, settings) -> None:
    response = client.post(
        f"{settings.api_prefix}/execute", json={"request": "hello there"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    assert body["error"]
    assert body["evidence"] == []


def test_error_envelope_always_has_a_suggested_action(
    client: TestClient, settings
) -> None:
    for path in ("/does-not-exist", f"{settings.api_prefix}/agents/nope"):
        error = client.get(path).json()["error"]
        assert error["code"]
        assert error["message"]
        assert error["suggested_action"]


def test_openapi_document_builds(client: TestClient) -> None:
    body = client.get("/openapi.json").json()

    assert body["info"]["title"]
    assert "/api/v1/execute" in body["paths"]


def test_secret_values_never_reach_a_response() -> None:
    """Naming an env var is fine; emitting its value is not.

    Asserts on the secret's *value*, not on the word "api_key" — status text
    legitimately mentions which variable to set.
    """
    from pydantic import SecretStr

    from app.services.blockscout import BlockscoutClient
    from app.services.codex import CodexClient
    from app.services.openrouter import OpenRouterClient

    secret = "sk-do-not-leak-9f4c21"
    clients = [
        OpenRouterClient(base_url="https://o.test", model="m", api_key=SecretStr(secret)),
        CodexClient(base_url="https://c.test", api_key=SecretStr(secret)),
        BlockscoutClient(base_url="https://b.test"),
    ]

    for candidate in clients:
        serialised = repr(candidate.describe())
        assert secret not in serialised
        assert secret not in repr(candidate.describe().get("base_url", ""))


# --- Live tests -------------------------------------------------------------


@pytest.mark.live
def test_live_chain_stats(client: TestClient, settings) -> None:
    response = client.get(f"{settings.api_prefix}/chain/stats")

    assert response.status_code == 200
    body = response.json()
    assert body["chain"]["id"] == 4663
    assert body["network"]["total_blocks"] > 1_000_000
    assert body["network"]["head_block"] > 1_000_000


@pytest.mark.live
def test_live_token_analysis(client: TestClient, settings) -> None:
    response = client.get(f"{settings.api_prefix}/token/{TOKEN}")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "succeeded"
    assert body["target"] == "token"
    assert body["agents_used"] == ["market", "risk"]
    assert body["evidence"]
    assert body["sources"]
    assert body["facts"]["token"]["symbol"]
    assert body["facts"]["risk"]["score"] >= 0


@pytest.mark.live
def test_live_status_reports_core_services(client: TestClient, settings) -> None:
    body = client.get(f"{settings.api_prefix}/status").json()

    states = {dep["name"]: dep["state"] for dep in body["dependencies"]}
    assert states["robinhood_rpc"] == "live"
    assert states["blockscout"] == "live"
