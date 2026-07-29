"""The watchlist and the monitor.

This is what turns change detection from a capability into an event. Every
test here guards one of the two ways it could go wrong: spending somebody's
quota without their understanding, or going quiet in a way that reads as
"nothing has changed".
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.repositories.api_keys import get_api_key_store
from app.repositories.watches import MAX_PER_KEY, WatchStore, get_watch_store

TOKEN = "0x" + "a" * 40
OTHER = "0x" + "b" * 40


@pytest.fixture
def owner() -> str:
    return (
        get_api_key_store()
        ._create("watcher", quota=100, is_admin=False, ip=None)
        .identity.id
    )


# --- Ownership --------------------------------------------------------------


async def test_a_watch_belongs_to_the_key_that_made_it(owner: str) -> None:
    """A watch records the address somebody cares about.

    At least as sensitive as having analysed it once, so it is scoped the same
    way execution history is.
    """
    store = get_watch_store()
    stranger = (
        get_api_key_store()
        ._create("stranger", quota=10, is_admin=False, ip=None)
        .identity.id
    )

    created = await store.create(
        owner_key_id=owner, target="token", address=TOKEN, interval_seconds=3600
    )
    assert created is not None

    assert len(store.list(owner)) == 1
    assert store.list(stranger) == []
    assert store.get(created.id, stranger) is None
    assert store.delete(created.id, stranger) is False


async def test_the_same_subject_cannot_be_watched_twice(owner: str) -> None:
    """Two entries would double the quota it costs and report every change
    twice."""
    store = get_watch_store()
    first = await store.create(
        owner_key_id=owner, target="token", address=TOKEN, interval_seconds=3600
    )
    second = await store.create(
        owner_key_id=owner, target="token", address=TOKEN, interval_seconds=900
    )

    assert first is not None
    assert second is None


async def test_the_same_address_under_a_different_target_is_separate(
    owner: str,
) -> None:
    """A token analysis and a contract analysis of one address ask different
    questions, so watching both is legitimate."""
    store = get_watch_store()

    assert (
        await store.create(
            owner_key_id=owner, target="token", address=TOKEN, interval_seconds=3600
        )
        is not None
    )
    assert (
        await store.create(
            owner_key_id=owner, target="contract", address=TOKEN, interval_seconds=3600
        )
        is not None
    )


# --- What is due ------------------------------------------------------------


async def test_a_new_watch_is_due_immediately(owner: str) -> None:
    """Otherwise creating a list means waiting an hour to learn anything."""
    store = get_watch_store()
    await store.create(
        owner_key_id=owner, target="token", address=TOKEN, interval_seconds=3600
    )

    due = store.due(limit=10)

    assert [item.address for item in due] == [TOKEN]


async def test_a_recently_checked_watch_is_not_due(owner: str) -> None:
    store = get_watch_store()
    created = await store.create(
        owner_key_id=owner, target="token", address=TOKEN, interval_seconds=3600
    )
    assert created is not None

    store.record_check(created.id, execution_id="run1", changes=None)

    assert store.due(limit=10) == []


async def test_a_watch_becomes_due_again_once_its_interval_elapses(
    owner: str,
) -> None:
    from app.core.database import get_session_factory
    from app.models.watch import Watch

    store = get_watch_store()
    created = await store.create(
        owner_key_id=owner, target="token", address=TOKEN, interval_seconds=900
    )
    assert created is not None
    store.record_check(created.id, execution_id="run1", changes=None)

    with get_session_factory()() as session:
        row = session.get(Watch, created.id)
        assert row is not None
        row.last_checked_at = datetime.now(UTC) - timedelta(seconds=1000)
        session.commit()

    assert len(store.due(limit=10)) == 1


async def test_a_paused_watch_is_never_due(owner: str) -> None:
    store = get_watch_store()
    created = await store.create(
        owner_key_id=owner, target="token", address=TOKEN, interval_seconds=900
    )
    assert created is not None

    store.set_active(created.id, owner, False)

    assert store.due(limit=10) == []


# --- Recording a check ------------------------------------------------------


async def test_a_failed_check_still_marks_the_watch_as_checked(
    owner: str,
) -> None:
    """Leaving the timestamp unset would make the watch permanently due and
    retry in a tight loop against whatever is already broken."""
    store = get_watch_store()
    created = await store.create(
        owner_key_id=owner, target="token", address=TOKEN, interval_seconds=3600
    )
    assert created is not None

    store.record_check(
        created.id, execution_id=None, changes=None, error="quota_exceeded"
    )

    assert store.due(limit=10) == []
    record = store.get(created.id, owner)
    assert record is not None
    assert record.last_error == "quota_exceeded"


async def test_changes_accumulate_across_checks(owner: str) -> None:
    """ "Three alarming changes since you started watching" has to come from
    somewhere that is not a re-diff of every stored run."""
    store = get_watch_store()
    created = await store.create(
        owner_key_id=owner, target="token", address=TOKEN, interval_seconds=3600
    )
    assert created is not None

    for _ in range(2):
        store.record_check(
            created.id,
            execution_id="run",
            changes={"total": 3, "alarming": 1, "items": []},
        )

    record = store.get(created.id, owner)
    assert record is not None
    assert record.checks_run == 2
    assert record.changes_seen == 6
    assert record.alarms_seen == 2


async def test_a_check_that_found_nothing_is_not_a_check_that_never_ran(
    owner: str,
) -> None:
    """The distinction the whole codebase is built on, at the watch level."""
    store = get_watch_store()
    created = await store.create(
        owner_key_id=owner, target="token", address=TOKEN, interval_seconds=3600
    )
    assert created is not None

    before = store.get(created.id, owner)
    assert before is not None
    assert before.last_checked_at is None

    store.record_check(
        created.id, execution_id="run", changes={"total": 0, "alarming": 0, "items": []}
    )

    after = store.get(created.id, owner)
    assert after is not None
    assert after.last_checked_at is not None
    assert after.changes_seen == 0


# --- Over the wire ----------------------------------------------------------


def test_a_watch_needs_an_address_unless_it_is_the_chain(
    client: TestClient, settings: Any
) -> None:
    refused = client.post(f"{settings.api_prefix}/watches", json={"target": "token"})
    assert refused.status_code == 422

    accepted = client.post(f"{settings.api_prefix}/watches", json={"target": "project"})
    assert accepted.status_code == 201


def test_a_site_cannot_be_watched(client: TestClient, settings: Any) -> None:
    """Repeatedly fetching somebody else's server on a timer is monitoring
    them, not watching a subject we have a relationship with."""
    response = client.post(
        f"{settings.api_prefix}/watches",
        json={"target": "site", "address": "https://example.com"},
    )

    assert response.status_code == 422


def test_an_interval_below_the_floor_is_raised_not_rejected(
    client: TestClient, settings: Any
) -> None:
    """Someone asking for every minute wants frequent checks. Giving them the
    fastest allowed is more useful than an error about a number they had no
    way to know."""
    response = client.post(
        f"{settings.api_prefix}/watches",
        json={"target": "token", "address": TOKEN, "interval_seconds": 5},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["interval_seconds"] == settings.watch_min_interval_seconds
    assert body["interval_was_floored"] is True


def test_the_list_says_when_nothing_is_actually_checking(
    client: TestClient, settings: Any
) -> None:
    """A deployment with the monitor off would otherwise show a watchlist that
    is silently never run."""
    response = client.get(f"{settings.api_prefix}/watches")

    assert response.status_code == 200
    body = response.json()
    assert body["monitor_running"] is settings.monitor_enabled
    if not settings.monitor_enabled:
        assert "not being checked" in body["note"]


def test_the_watchlist_is_capped(client: TestClient, settings: Any) -> None:
    """Each entry is a recurring charge, so an unbounded list would drain a
    key's allowance without anybody choosing that."""
    store = WatchStore()
    identity = (
        get_api_key_store()._create("capped", quota=10, is_admin=False, ip=None).identity
    )

    for index in range(MAX_PER_KEY):
        store._create(
            owner_key_id=identity.id,
            target="token",
            address=f"0x{index:040x}",
            label="",
            interval_seconds=3600,
        )

    assert store.count_for(identity.id) == MAX_PER_KEY


# --- The monitor skips the summary -----------------------------------------


async def test_a_monitored_run_generates_no_prose(fake_services: Any) -> None:
    """The AI summary is over half the wall time of a run, and the point of a
    repeat check is the diff — not fresh prose about an unmoved token."""
    from app.engine.context import ExecutionContext, ExecutionRequest
    from app.pipelines.stages import SummaryStage

    context = ExecutionContext(
        request=ExecutionRequest(request="x"),
        services=fake_services,
        summarize=False,
    )
    context.facts["token"] = {"symbol": "TEST"}

    summary = await SummaryStage().run(context)

    assert context.summary is None
    assert context.summary_status == "skipped"
    assert "scheduled check" in (context.summary_detail or "")
    assert "skipped" in summary.lower()
