"""Who may call, how often, and how much they may spend.

The threat this guards against is specific and was measured: an open
deployment lets a stranger spend this project's inference credit at roughly a
cent an analysis and a thousand analyses an hour, and it publishes on a
world-readable list every wallet address anyone has ever asked about.
"""

from __future__ import annotations

import time
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.exceptions import QuotaExceededError
from app.core.security import (
    KEY_PREFIX,
    display_hint,
    generate_key,
    hash_key,
    looks_like_key,
    verify_key,
)
from app.engine.result import ExecutionResult
from app.models.enums import ExecutionStatus, PipelineStage
from app.repositories.api_keys import get_api_key_store

WALLET = "0x" + "e" * 40


# --- The secret itself ------------------------------------------------------


def test_a_key_is_never_stored_in_the_clear() -> None:
    """A leaked database must not be a leaked set of working credentials."""
    secret = generate_key()

    assert hash_key(secret) != secret
    assert secret not in hash_key(secret)
    assert verify_key(secret, hash_key(secret))


def test_a_wrong_key_does_not_verify() -> None:
    assert not verify_key(generate_key(), hash_key(generate_key()))


def test_keys_are_unique_and_prefixed() -> None:
    """The prefix is what makes a leaked key recognisable to a secret scanner."""
    keys = {generate_key() for _ in range(200)}

    assert len(keys) == 200
    assert all(key.startswith(KEY_PREFIX) for key in keys)


def test_the_hint_cannot_be_used_as_a_key() -> None:
    """It exists so a person can tell their keys apart, and nothing more."""
    secret = generate_key()
    hint = display_hint(secret)

    assert len(hint) < len(secret) / 2
    assert not verify_key(hint, hash_key(secret))


@pytest.mark.parametrize(
    "value", ["", "bearer", "nope", KEY_PREFIX, f"{KEY_PREFIX}short"]
)
def test_a_malformed_token_is_rejected_before_a_database_read(value: str) -> None:
    assert not looks_like_key(value)


# --- Enforcement on the wire ------------------------------------------------


def test_an_analysis_without_a_key_is_refused(
    anonymous_client: TestClient, settings: Any
) -> None:
    response = anonymous_client.get(f"{settings.api_prefix}/project")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "authentication_required"


def test_an_invalid_key_is_refused(anonymous_client: TestClient, settings: Any) -> None:
    response = anonymous_client.get(
        f"{settings.api_prefix}/project",
        headers={"authorization": f"Bearer {generate_key()}"},
    )

    assert response.status_code == 401


def test_a_revoked_key_stops_working(anonymous_client: TestClient, settings: Any) -> None:
    store = get_api_key_store()
    issued = store._create("revoked", quota=10, is_admin=False, ip=None)

    ok = anonymous_client.get(
        f"{settings.api_prefix}/keys/me",
        headers={"authorization": f"Bearer {issued.secret}"},
    )
    assert ok.status_code == 200

    store.revoke(issued.identity.id)

    after = anonymous_client.get(
        f"{settings.api_prefix}/keys/me",
        headers={"authorization": f"Bearer {issued.secret}"},
    )
    assert after.status_code == 401


def test_reading_the_chain_still_needs_no_analysis_quota(
    client: TestClient, settings: Any
) -> None:
    """Reads cost nothing upstream, so they must not consume an allowance."""
    before = client.get(f"{settings.api_prefix}/keys/me").json()["used_today"]
    client.get(f"{settings.api_prefix}/agents")
    after = client.get(f"{settings.api_prefix}/keys/me").json()["used_today"]

    assert before == after


# --- The spend cap ----------------------------------------------------------


async def test_quota_refuses_once_the_allowance_is_spent() -> None:
    store = get_api_key_store()
    issued = store._create("tiny", quota=2, is_admin=False, ip=None)

    assert await store.consume(issued.identity.id) == 1
    assert await store.consume(issued.identity.id) == 0

    with pytest.raises(QuotaExceededError) as caught:
        await store.consume(issued.identity.id)

    # The remedy differs from a rate limit, so the error has to say when the
    # allowance actually returns rather than "retry shortly".
    assert "resets_at" in caught.value.details


def test_concurrent_requests_cannot_overspend_the_cap() -> None:
    """The cap has to hold when it matters, which is under load.

    A read-then-write would pass every sequential test and still let a
    fiftieth request through a fifty-a-day limit on PostgreSQL, where two
    callers can both read the same `used_today`. SQLite hides that by
    serialising writers — so this asserts the outcome rather than the
    mechanism, and would fail on either engine if the guard were removed.
    """
    import threading

    store = get_api_key_store()
    issued = store._create("race", quota=10, is_admin=False, ip=None)
    granted: list[int] = []

    def attempt() -> None:
        try:
            store._consume(issued.identity.id)
            granted.append(1)
        except QuotaExceededError:
            pass

    threads = [threading.Thread(target=attempt) for _ in range(40)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert len(granted) == 10


async def test_a_refund_returns_the_unit() -> None:
    """A request rejected before any service call cost nothing to serve."""
    store = get_api_key_store()
    issued = store._create("refundable", quota=1, is_admin=False, ip=None)

    await store.consume(issued.identity.id)
    await store.refund(issued.identity.id)

    assert await store.consume(issued.identity.id) == 0


async def test_a_rejected_address_does_not_spend_quota(
    client: TestClient, settings: Any
) -> None:
    """The refund path, end to end.

    A mistyped address is caught before a single service call. Charging for it
    would let a typo quietly eat a fiftieth of someone's day.
    """
    before = client.get(f"{settings.api_prefix}/keys/me").json()["used_today"]

    rejected = client.get(f"{settings.api_prefix}/token/not-an-address")
    assert rejected.status_code == 422

    after = client.get(f"{settings.api_prefix}/keys/me").json()["used_today"]
    assert after == before


def test_quota_survives_a_restart() -> None:
    """It guards money, so it lives in the database rather than in memory."""
    store = get_api_key_store()
    issued = store._create("durable", quota=5, is_admin=False, ip=None)
    store._consume(issued.identity.id)

    # A fresh store object stands in for a new process.
    from app.repositories.api_keys import ApiKeyStore

    reloaded = ApiKeyStore()._resolve(issued.secret)

    assert reloaded is not None
    assert reloaded.used_today == 1


# --- History is not public --------------------------------------------------


def test_one_key_cannot_read_another_keys_executions() -> None:
    """A wallet analysis records the address someone asked about."""
    store = get_api_key_store()
    mine = store._create("mine", quota=10, is_admin=False, ip=None)
    yours = store._create("yours", quota=10, is_admin=False, ip=None)

    from app.repositories import get_execution_store

    executions = get_execution_store()
    executions._write(
        "wallet",
        ExecutionResult(
            execution_id="private",
            status=ExecutionStatus.SUCCEEDED,
            stage=PipelineStage.REPORT,
            target="wallet",
            address=WALLET,
            owner_key_id=mine.identity.id,
        ),
    )

    assert executions.get("private", mine.identity.id) is not None
    assert executions.get("private", yours.identity.id) is None
    # The permalink reads the full result, and must be scoped identically —
    # an unguessable id is obscurity, not access control.
    assert executions.get_result("private", yours.identity.id) is None


def test_a_stranger_cannot_reach_a_permalink_over_http(
    anonymous_client: TestClient, settings: Any
) -> None:
    store = get_api_key_store()
    owner = store._create("owner", quota=10, is_admin=False, ip=None)
    outsider = store._create("outsider", quota=10, is_admin=False, ip=None)

    from app.repositories import get_execution_store

    get_execution_store()._write(
        "wallet",
        ExecutionResult(
            execution_id="linked",
            status=ExecutionStatus.SUCCEEDED,
            stage=PipelineStage.REPORT,
            target="wallet",
            address=WALLET,
            owner_key_id=owner.identity.id,
        ),
    )

    response = anonymous_client.get(
        f"{settings.api_prefix}/executions/linked/result",
        headers={"authorization": f"Bearer {outsider.secret}"},
    )

    # 404 rather than 403: distinguishing them would confirm to a prober that
    # the id exists on the platform.
    assert response.status_code == 404


def test_the_listing_only_shows_your_own_runs() -> None:
    store = get_api_key_store()
    mine = store._create("list-mine", quota=10, is_admin=False, ip=None)
    yours = store._create("list-yours", quota=10, is_admin=False, ip=None)

    from app.repositories import get_execution_store

    executions = get_execution_store()
    for index, owner in enumerate((mine, mine, yours)):
        executions._write(
            "wallet",
            ExecutionResult(
                execution_id=f"listed{index}",
                status=ExecutionStatus.SUCCEEDED,
                stage=PipelineStage.REPORT,
                target="wallet",
                address=WALLET,
                owner_key_id=owner.identity.id,
            ),
        )

    assert len(executions.all(mine.identity.id)) == 2
    assert len(executions.all(yours.identity.id)) == 1
    assert executions.stats(mine.identity.id)["total"] == 2


def test_the_cache_is_not_shared_between_keys() -> None:
    """Serving one key's stored run to another would disclose that they ran it."""
    store = get_api_key_store()
    mine = store._create("cache-mine", quota=10, is_admin=False, ip=None)
    yours = store._create("cache-yours", quota=10, is_admin=False, ip=None)

    from app.repositories import get_execution_store

    executions = get_execution_store()
    executions._write(
        "wallet",
        ExecutionResult(
            execution_id="cached",
            status=ExecutionStatus.SUCCEEDED,
            stage=PipelineStage.REPORT,
            target="wallet",
            address=WALLET,
            owner_key_id=mine.identity.id,
        ),
    )

    assert executions.find_recent("wallet", WALLET, 600, mine.identity.id) is not None
    assert executions.find_recent("wallet", WALLET, 600, yours.identity.id) is None


# --- Pace, as distinct from spend -------------------------------------------


def test_the_limiter_lets_a_normal_caller_through() -> None:
    from app.middleware.rate_limit import _Window

    window = _Window()
    now = time.monotonic()

    assert all(window.allow(5, 60.0, now + index) is None for index in range(5))


def test_the_limiter_refuses_a_burst_and_says_how_long_to_wait() -> None:
    from app.middleware.rate_limit import _Window

    window = _Window()
    now = time.monotonic()
    for _ in range(3):
        window.allow(3, 60.0, now)

    retry_after = window.allow(3, 60.0, now)

    assert retry_after is not None
    assert 0 < retry_after <= 60.0


def test_the_window_rolls_forward() -> None:
    """A limit that never released would be a ban, not a rate limit."""
    from app.middleware.rate_limit import _Window

    window = _Window()
    now = time.monotonic()
    for _ in range(3):
        window.allow(3, 10.0, now)

    assert window.allow(3, 10.0, now) is not None
    assert window.allow(3, 10.0, now + 11) is None


def test_a_spoofed_forwarding_header_is_ignored_by_default() -> None:
    """`x-forwarded-for` is caller-supplied.

    Trusting it on a directly-exposed service would let anyone reset their own
    limit by inventing a header, so it is only read behind a configured proxy.
    """
    from starlette.datastructures import Headers

    from app.middleware.rate_limit import RateLimitMiddleware

    class _Request:
        headers = Headers({"x-forwarded-for": "1.2.3.4"})
        client = type("C", (), {"host": "10.0.0.1"})()

    assert RateLimitMiddleware._client_ip(_Request()) == "10.0.0.1"  # type: ignore[arg-type]


# --- Self-serve signup ------------------------------------------------------


def test_a_key_is_returned_once_and_never_again(
    anonymous_client: TestClient, settings: Any
) -> None:
    response = anonymous_client.post(
        f"{settings.api_prefix}/keys", json={"label": "docs"}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["key"].startswith(KEY_PREFIX)

    # Nothing anywhere else may echo it back.
    me = anonymous_client.get(
        f"{settings.api_prefix}/keys/me",
        headers={"authorization": f"Bearer {body['key']}"},
    ).json()
    assert body["key"] not in str(me)
    assert me["hint"] == body["hint"]


def test_one_address_cannot_mint_unlimited_quota(
    anonymous_client: TestClient, settings: Any
) -> None:
    """Otherwise self-serve signup is just a slower route to unlimited spend.

    Each key carries its own daily allowance, so without a cap on issuance the
    allowance means nothing — a caller mints a fresh one whenever the last runs
    out.
    """
    allowance = settings.signup_keys_per_ip_per_day

    for _ in range(allowance):
        assert (
            anonymous_client.post(f"{settings.api_prefix}/keys", json={}).status_code
            == 201
        )

    refused = anonymous_client.post(f"{settings.api_prefix}/keys", json={})

    assert refused.status_code == 429
    assert refused.json()["error"]["code"] == "signup_rate_limited"


def test_an_ordinary_key_cannot_list_every_key(
    anonymous_client: TestClient, settings: Any
) -> None:
    issued = get_api_key_store()._create("plain", quota=5, is_admin=False, ip=None)

    response = anonymous_client.get(
        f"{settings.api_prefix}/keys",
        headers={"authorization": f"Bearer {issued.secret}"},
    )

    assert response.status_code == 403


def test_an_admin_listing_carries_no_secrets(client: TestClient, settings: Any) -> None:
    response = client.get(f"{settings.api_prefix}/keys")

    assert response.status_code == 200
    body = response.text
    assert "key_hash" not in body
    for item in response.json()["items"]:
        assert "key" not in item
        assert item["hint"].endswith("…")
