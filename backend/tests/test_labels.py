"""Supplier names must not reach a reader.

The console rewrote labels on the way to the screen, which looked like enough
until a published report read "$1.00001643726 via Codex". The model had learned
the word from a fact key, so no client-side rewrite could ever have caught it.
These tests guard the server side, where the word actually enters.
"""

from __future__ import annotations

import json

import pytest

from app.engine.labels import describe_service, describe_source, redact_facts

#: Every supplier this deployment talks to. A leak of any of them is the bug.
VENDORS = (
    "blockscout",
    "goplus",
    "codex",
    "openrouter",
    "openchain",
    "exa",
    "tavily",
    "jina",
    "firecrawl",
    "e2b",
    "microlink",
)


@pytest.mark.parametrize(
    ("label", "expected"),
    [
        ("Blockscout token page", "Chain explorer"),
        ("Blockscout stats API", "Chain explorer"),
        ("GoPlus token security", "Security screening"),
        ("Codex market data", "Market data"),
        ("Jina Reader", "Page retrieval"),
    ],
)
def test_a_source_is_named_by_what_it_contributed(label: str, expected: str) -> None:
    assert describe_source(label) == expected


def test_substitutions_do_not_stutter() -> None:
    """ "Blockscout explorer" must not become "Chain explorer explorer"."""
    assert describe_source("Blockscout explorer") == "Chain explorer"


def test_the_chain_node_keeps_its_name() -> None:
    """RPC names a protocol, not a company. Vaguening it loses real meaning."""
    assert describe_service("robinhood_rpc") == "Chain node"


def test_an_unknown_service_still_gets_a_role() -> None:
    assert describe_service("something_new") == "Data source"


# --- Facts ------------------------------------------------------------------


def test_vendor_named_fact_keys_are_renamed() -> None:
    """This is the path that actually leaked: the model read the key."""
    redacted = redact_facts({"codex": {"price": 1.0}, "deployer_share_goplus_pct": 0.0})

    assert "codex" not in redacted
    assert "market" in redacted
    assert "deployer_share_screened_pct" in redacted


def test_no_vendor_survives_anywhere_in_a_facts_tree() -> None:
    facts = {
        "codex": {"state": "live"},
        "sources": [{"label": "GoPlus token security", "url": "https://x.test"}],
        "nested": {"deep": {"blockscout_verified": True}},
    }

    blob = json.dumps(redact_facts(facts)).lower()

    for vendor in VENDORS:
        assert vendor not in blob, f"{vendor!r} survived redaction"


def test_structure_and_values_are_preserved() -> None:
    """Redaction renames. It must not drop, reorder, or retype anything."""
    facts = {
        "codex": {"price": 1.5, "pools": 6, "ok": True, "missing": None},
        "list": [1, 2, {"blockscout": "x"}],
    }

    redacted = redact_facts(facts)

    assert redacted["market"]["price"] == 1.5
    assert redacted["market"]["pools"] == 6
    assert redacted["market"]["ok"] is True
    assert redacted["market"]["missing"] is None
    assert len(redacted["list"]) == 3


def test_a_colliding_rename_keeps_both_facts() -> None:
    """Losing a fact to cosmetics would be a far worse trade than a vendor-
    shaped key surviving."""
    redacted = redact_facts({"market": {"a": 1}, "codex": {"b": 2}})

    assert len(redacted) == 2
    assert {"a": 1} in redacted.values()
    assert {"b": 2} in redacted.values()


def test_non_string_keys_are_left_alone() -> None:
    assert redact_facts({1: "x", None: "y"}) == {1: "x", None: "y"}


def test_urls_are_not_mangled() -> None:
    """A link is the thing that makes a finding checkable. It must survive."""
    redacted = redact_facts({"url": "https://robinhoodchain.example.test/token/0x1"})

    assert redacted["url"].startswith("https://")


# --- The whole report -------------------------------------------------------


def test_a_rendered_report_names_no_supplier_outside_its_links() -> None:
    """The end-to-end guard.

    Redaction is applied in several places — fact keys, evidence labels,
    unknown reasons, risk signal detail, source labels, and the stored summary.
    Any one of them being missed puts a vendor name in front of a reader, which
    is how this shipped the first time. This asserts the finished artifact.
    """
    import re

    from app.engine.report import build_report

    execution = {
        "execution_id": "ex_leak",
        "target": "token",
        "address": "0x" + "a" * 40,
        "summary": "Price of $1.00 via Codex, screened by GoPlus.",
        "summary_status": "generated",
        "execution_time_ms": 100,
        "facts": {
            "codex": {"price": 1.0},
            "risk": {
                "score": 40,
                "level": "elevated",
                "signals": [
                    {"severity": "high", "detail": "GoPlus reported a transfer fee."}
                ],
            },
        },
        "evidence": [
            {
                "label": "Blockscout verification",
                "state": "unknown",
                "reason": "GoPlus did not determine whether this token can be sold.",
            }
        ],
        "sources": [
            {
                "label": "Blockscout token page",
                "url": "https://robinhoodchain.blockscout.com/token/0x1",
            }
        ],
        "stages": [],
    }

    markdown = build_report(execution).artifacts[0].content

    # A link legitimately carries a vendor hostname — that is the destination,
    # and rewriting it would break the one thing that makes a finding checkable.
    prose = re.sub(r"\((https?://[^)]+)\)", "(link)", markdown).lower()

    for vendor in VENDORS:
        assert vendor not in prose, f"{vendor!r} reached the reader"

    # The link itself survived untouched.
    assert "https://robinhoodchain.blockscout.com/token/0x1" in markdown


def test_a_link_inside_a_label_is_not_rewritten() -> None:
    """The bug this caught in review.

    `https://robinhoodchain.blockscout.com/…` became
    `https://robinhoodchain.Chain explorer.com/…` — a link that no longer
    resolves. That trades the only guarantee a finding has for a cosmetic one.
    """
    url = "https://robinhoodchain.blockscout.com/token/0x1"

    assert describe_source(url) == url
    assert redact_facts({"url": url})["url"] == url


def test_prose_around_a_link_is_still_rewritten() -> None:
    result = describe_source("GoPlus says https://goplus.example/x is fine")

    assert result.startswith("Security screening says")
    assert "https://goplus.example/x" in result


def test_a_supplier_inside_a_value_is_removed() -> None:
    """Agents write prose into values: "0.0% (GoPlus: 0.0%)" reached a reader
    through the data rather than through a label."""
    assert describe_source("0.0% (GoPlus: 0.0%)") == "0.0% (Security screening: 0.0%)"


def test_the_execution_response_carries_no_supplier_names() -> None:
    """The raw analysis response is the path the console and Molt AI read.

    Reports, comparisons and the summariser each redacted their own output,
    which left this one — so `"Blockscout token page"` and `"GoPlus reports
    that…"` reached users through both surfaces after the leak was believed
    closed. The rule belongs at the boundary, not in each consumer.
    """
    from app.api.v1.endpoints.execute import to_response
    from app.engine.result import ExecutionResult

    url = "https://robinhoodchain.blockscout.com/token/0xabc"
    response = to_response(
        ExecutionResult(
            execution_id="e1",
            status="succeeded",  # type: ignore[arg-type]
            stage="report",  # type: ignore[arg-type]
            services_called=["blockscout", "codex", "goplus"],
            summary="Blockscout shows the contract is verified.",
            summary_detail="GoPlus screening completed.",
            facts={"token": {"deployer_share_goplus_pct": 12.0}},
            evidence=[
                {
                    "id": "ev1",
                    "stage": "engine",
                    "kind": "verification",
                    "label": "Blockscout token page",
                    "source_url": url,
                    "created_at": "2026-07-31T00:00:00Z",
                }
            ],
            sources=[{"label": "GoPlus token security", "url": url}],
        )
    )

    payload = response.model_dump_json()
    for vendor in ("blockscout", "goplus", "codex"):
        # The hostname is an address rather than prose, so it is the one place
        # the name legitimately survives — a rewritten URL is a broken link.
        without_urls = payload.replace(url, "")
        assert vendor not in without_urls.lower(), vendor

    # The link still resolves. Rewriting a hostname is the failure mode this
    # protection exists for: `https://robinhoodchain.Chain explorer.com/…`.
    dumped = response.model_dump()
    assert dumped["evidence"][0]["source_url"] == url
    assert dumped["sources"][0]["url"] == url
    assert "goplus" not in str(response.facts).lower()
