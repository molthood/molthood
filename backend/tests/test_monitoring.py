"""Error tracking must not become a leak.

Sentry needs to know what broke and where. It does not need to know who asked
about what, and this backend's error context is full of exactly that.
"""

from __future__ import annotations

from app.core.monitoring import _scrub, _scrub_url


def test_an_address_in_a_path_becomes_a_route() -> None:
    """Also the difference between one issue and a hundred: without this, the
    same bug against a hundred tokens looks like a hundred small problems."""
    assert _scrub_url("https://api.test/api/v1/token/0xabcdef123456") == (
        "https://api.test/api/v1/token/{address}"
    )


def test_an_execution_id_becomes_a_route() -> None:
    assert _scrub_url("/api/v1/reports/" + "a" * 32) == "/api/v1/reports/{id}"


def test_a_query_string_never_survives() -> None:
    assert "?" not in _scrub_url("/api/v1/site?url=https://someone.test")


def test_the_request_body_is_dropped_entirely() -> None:
    """A free-form request lives there. There is no version of it that is safe
    to send."""
    event = _scrub({"request": {"data": {"request": "analyse 0xabc"}}}, {})

    assert "data" not in event["request"]


def test_credentials_are_redacted_from_headers() -> None:
    event = _scrub(
        {"request": {"headers": {"Authorization": "Bearer mk_live_secret"}}}, {}
    )

    assert event["request"]["headers"]["Authorization"] == "[redacted]"


def test_content_bearing_extras_are_redacted() -> None:
    event = _scrub({"extra": {"address": "0xabc", "duration_ms": 8000}}, {})

    assert event["extra"]["address"] == "[redacted]"
    # What broke is kept. Scrubbing that too would leave nothing to debug.
    assert event["extra"]["duration_ms"] == 8000


def test_breadcrumbs_are_scrubbed_too() -> None:
    """Half of them carry a source URL."""
    event = _scrub(
        {"breadcrumbs": {"values": [{"message": "GET /api/v1/token/0xabcdef123456"}]}},
        {},
    )

    assert "0xabcdef" not in event["breadcrumbs"]["values"][0]["message"]


def test_an_event_with_nothing_sensitive_passes_through() -> None:
    event = _scrub({"level": "error", "message": "database unavailable"}, {})

    assert event["message"] == "database unavailable"
