"""The event taxonomy.

One rule, enforced rather than documented: an event may never carry what
somebody analysed. Product analytics is a third party, and sending it an
address would publish exactly what per-key scoping exists to protect.
"""

from __future__ import annotations

from app.engine.analytics import Event, sanitise


def test_an_address_never_leaves_the_platform() -> None:
    clean = sanitise({"address": "0x" + "a" * 40, "target": "token"})

    assert "address" not in clean
    assert clean["target"] == "token"


def test_every_content_bearing_name_is_blocked() -> None:
    """Blocked by name, because remembering at each call site has already been
    shown not to work for supplier names."""
    for field in ("address", "wallet", "url", "request", "query", "summary", "api_key"):
        assert field not in sanitise({field: "something"}), field


def test_prose_is_dropped_even_under_an_innocent_name() -> None:
    """A long string is content whatever the key is called."""
    clean = sanitise({"note": "x" * 200})

    assert "note" not in clean


def test_short_enumerated_values_survive() -> None:
    clean = sanitise({"target": "token", "status": "succeeded", "duration_ms": 8000})

    assert clean["target"] == "token"
    assert clean["status"] == "succeeded"
    assert clean["duration_ms"] == 8000


def test_nested_structures_are_reduced_to_their_size() -> None:
    """A URL hides two levels down. The count was the only part that was ever
    a shape."""
    clean = sanitise({"evidence": [{"source_url": "https://x.test"}]})

    assert "evidence" not in clean
    assert clean["evidence_count"] == 1


def test_dropping_is_visible_rather_than_silent() -> None:
    """Otherwise the code appears to send something it does not."""
    clean = sanitise({"address": "0xabc", "target": "token"})

    assert clean["dropped_properties"] == 1


def test_event_names_are_defined_once() -> None:
    """A literal typed twice becomes two events that look like one, and the
    funnel loses half its traffic with nothing failing."""
    values = [member.value for member in Event]

    assert len(values) == len(set(values))
    assert all(value.islower() for value in values)
