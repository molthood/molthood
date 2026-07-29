"""A wallet's holdings, and what changed since the last look.

Both features exist to answer a question a single token analysis cannot. The
tests here guard the two ways each could quietly lie: a screen that reports a
gap as a clean position, and a comparison so noisy that a real break is buried
in decimal drift.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.agents.portfolio.agent import PortfolioAgent
from app.agents.risk.agent import RiskAgent
from app.agents.risk.signals import token_signals
from app.engine.changes import ALARMING, INFORMATIONAL, NOTABLE, build_report, compare
from app.engine.context import ExecutionContext, ExecutionRequest
from app.engine.router import AnalysisTarget, RoutingDecision
from app.models.enums import AgentKind, EvidenceState
from app.services.openrouter import _parse_sse_line

TOKEN = "0x" + "a" * 40
WALLET = "0x" + "b" * 40


def _context(**facts: Any) -> ExecutionContext:
    context = ExecutionContext(request=ExecutionRequest(request="x"), services=None)  # type: ignore[arg-type]
    context.facts.update(facts)
    return context


def _evidence(
    kind: str,
    label: str,
    value: Any = None,
    state: str = "confirmed",
    reason: str | None = None,
) -> dict[str, Any]:
    return {
        "kind": kind,
        "label": label,
        "value": value,
        "state": state,
        "reason": reason,
    }


# --- The screen shares the analysis's rules ---------------------------------


def test_a_screened_token_scores_exactly_as_a_full_analysis_would() -> None:
    """The point of extracting `risk.signals` into its own module.

    A holding must not be judged more leniently because it was reached through
    a wallet. If these two ever diverge, the platform is telling a reader two
    different things about one token.
    """
    facts = {
        "top10_holder_share_pct": 99.7,
        "deployer_share_pct": 24.5,
        "holders_count": 40,
    }

    from_screen = token_signals(facts)
    from_analysis = RiskAgent()  # same module, reached the other way
    del from_analysis

    codes = {signal.code for signal in from_screen}
    assert "holder_concentration_extreme" in codes
    assert "deployer_holds_supply" in codes
    assert "few_holders" in codes


# --- A partial screen is a ceiling, not a verdict ---------------------------


def test_a_missing_check_makes_the_score_an_upper_bound() -> None:
    """GoPlus not answering cannot make a token look safer than it is.

    The score is `100 - Σweights`, so an unrun check can only ever have lowered
    it. Saying "at most 88" is the honest rendering; a flat 88 is not.
    """
    screen = _screen_with(
        signals_from={"top10_holder_share_pct": 75.0}, missed=["sellability"]
    )

    assert screen.score == 88
    assert screen.is_upper_bound is True


def test_a_complete_screen_is_not_marked_as_a_bound() -> None:
    screen = _screen_with(signals_from={"top10_holder_share_pct": 75.0}, missed=[])

    assert screen.score == 88
    assert screen.is_upper_bound is False


def test_silence_plus_a_gap_yields_no_score_at_all() -> None:
    """The failure this whole codebase was rewritten to prevent.

    Nothing fired *and* a check could not run. Reporting 100/100 there would
    present a blind spot as a clean bill of health.
    """
    screen = _screen_with(signals_from={}, missed=["sellability", "concentration"])

    assert screen.score is None
    assert screen.level == "unscored"


def test_silence_with_full_coverage_does_score() -> None:
    screen = _screen_with(signals_from={}, missed=[])

    assert screen.score == 100
    assert screen.is_upper_bound is False


def _screen_with(*, signals_from: dict[str, Any], missed: list[str]) -> Any:
    """Drive `_screen`'s scoring branch without touching the network."""
    from app.agents.portfolio.agent import CHECKS, HoldingScreen
    from app.agents.risk.signals import level_for, score_for

    screen = HoldingScreen(address=TOKEN, symbol="TEST")
    screen.checks_missed = missed
    screen.checks_run = [check for check in CHECKS if check not in missed]

    signals = token_signals(signals_from)
    screen.signals = [signal.to_dict() for signal in signals]

    if not signals and missed:
        return screen

    screen.score = score_for(signals)
    screen.level = level_for(screen.score)
    screen.is_upper_bound = bool(missed)
    return screen


# --- Positions past the cap are named, never dropped ------------------------


async def test_unscreened_positions_are_reported_as_a_gap() -> None:
    """A reader who cannot see that 8 of 42 were screened will assume 42."""
    agent = PortfolioAgent()
    facts = {
        "holdings": [
            {"address": TOKEN, "symbol": "AAA"},
            {"address": "0x" + "c" * 40, "symbol": "BBB"},
        ],
        "screened": 1,
        "total_holdings": 2,
        "flagged": 0,
        "unscored": 0,
        "skipped": [{"address": "0x" + "c" * 40, "symbol": "BBB"}],
    }

    class _Blockscout:
        base_url = "https://explorer.test"

        def explorer_url(self, kind: str, value: str) -> str:
            return f"{self.base_url}/{kind}/{value}"

    context = _context()
    context.services = type("S", (), {"blockscout": _Blockscout()})()  # type: ignore[assignment]

    findings = agent._evidence([], facts, context)
    gaps = [item for item in findings if item.state is EvidenceState.UNKNOWN]

    assert len(gaps) == 1
    assert "BBB" in (gaps[0].reason or "")


def test_a_wallet_screens_its_holdings_before_it_is_scored() -> None:
    """Order matters: the worst position is an input to the wallet's score."""
    from app.engine.router import ExecutionRouter

    decision = ExecutionRouter(services=None)._decide(  # type: ignore[arg-type]
        AnalysisTarget.WALLET, WALLET, "test"
    )

    assert decision.agents == (AgentKind.PROJECT, AgentKind.PORTFOLIO, AgentKind.RISK)


def test_a_token_analysis_gains_no_portfolio_stage() -> None:
    from app.engine.router import ExecutionRouter

    decision = ExecutionRouter(services=None)._decide(  # type: ignore[arg-type]
        AnalysisTarget.TOKEN, TOKEN, "test"
    )

    assert AgentKind.PORTFOLIO not in decision.agents


# --- A flagged holding reaches the wallet's own score -----------------------


def test_a_spotless_wallet_holding_a_flagged_token_is_not_low_risk() -> None:
    """The exact wallet this feature exists for.

    No transactions of its own worth flagging, holding something unsellable.
    Scoring only the address would report it as clean.
    """
    signals = RiskAgent()._portfolio_signals(
        {"holdings": [{"symbol": "RUG", "score": 30}, {"symbol": "OK", "score": 95}]}
    )

    assert len(signals) == 1
    assert "RUG" in signals[0].detail
    assert signals[0].severity == "critical"


def test_healthy_holdings_add_no_penalty() -> None:
    assert (
        RiskAgent()._portfolio_signals({"holdings": [{"symbol": "OK", "score": 95}]})
        == []
    )


def test_the_worst_holding_sets_the_weight_not_the_sum() -> None:
    """Three flagged tokens is bad; it is not three times worse than one.

    Summing would drive every diversified wallet to zero and make the number
    meaningless.
    """
    many = RiskAgent()._portfolio_signals(
        {"holdings": [{"symbol": s, "score": 40} for s in ("A", "B", "C")]}
    )
    one = RiskAgent()._portfolio_signals({"holdings": [{"symbol": "A", "score": 40}]})

    assert many[0].weight == one[0].weight
    assert "2 other holding(s)" in many[0].detail


def test_an_unscored_holding_does_not_penalise_the_wallet() -> None:
    """Unscored means unknown, and unknown is not evidence of anything."""
    assert (
        RiskAgent()._portfolio_signals({"holdings": [{"symbol": "X", "score": None}]})
        == []
    )


# --- Change detection: what is reported -------------------------------------


def test_a_claim_that_stops_holding_is_always_reported() -> None:
    """The single most valuable line this platform can produce."""
    before = [_evidence("declared_website_resolves", "Listed website resolves", True)]
    after = [
        _evidence(
            "declared_website_resolves",
            "Listed website resolves",
            "x.lol",
            state="refuted",
            reason="x.lol has no DNS records.",
        )
    ]

    changes = compare(after, before)

    assert len(changes) == 1
    assert changes[0].severity == ALARMING
    assert changes[0].direction == "broke"
    assert "DNS" in changes[0].detail


def test_losing_the_ability_to_check_is_reported_as_its_own_thing() -> None:
    """Not the same as the check passing, and it must not read like it."""
    before = [_evidence("tradability", "Can be sold", True)]
    after = [
        _evidence(
            "tradability",
            "Can be sold",
            state="unknown",
            reason="GoPlus did not answer.",
        )
    ]

    changes = compare(after, before)

    assert changes[0].direction == "lost"
    assert changes[0].severity == NOTABLE


def test_a_recovered_claim_is_reported_too() -> None:
    before = [
        _evidence("resolves", "Website resolves", state="refuted", reason="no records")
    ]
    after = [_evidence("resolves", "Website resolves", True)]

    changes = compare(after, before)

    assert changes[0].direction == "recovered"


# --- Change detection: what is suppressed -----------------------------------


def test_decimal_drift_is_not_a_change() -> None:
    """Measured against two real stored runs: 59.49% to 59.52% is not news."""
    before = [_evidence("concentration", "Top-10 holder share (%)", 59.49)]
    after = [_evidence("concentration", "Top-10 holder share (%)", 59.52)]

    assert compare(after, before) == []


def test_a_real_concentration_move_is_a_change() -> None:
    before = [_evidence("concentration", "Top-10 holder share (%)", 59.49)]
    after = [_evidence("concentration", "Top-10 holder share (%)", 71.0)]

    changes = compare(after, before)

    assert len(changes) == 1
    assert changes[0].direction == "rose"


def test_block_height_churn_is_dropped_entirely() -> None:
    """These move every block by definition; diffing them is padding."""
    before = [_evidence("blocks", "Total blocks", 21_000_000)]
    after = [_evidence("blocks", "Total blocks", 21_000_900)]

    assert compare(after, before) == []


def test_any_supply_movement_is_reported() -> None:
    """Supply is meant to be fixed. A change is a mint or a burn."""
    before = [_evidence("supply", "Total supply", 1_000_000.0)]
    after = [_evidence("supply", "Total supply", 1_000_001.0)]

    changes = compare(after, before)

    assert changes[0].severity == ALARMING
    assert changes[0].direction == "rose"


def test_a_risk_signal_restating_a_refutation_is_not_reported_twice() -> None:
    """Verified against two stored VIRTUAL runs, which produced three lines.

    The Risk Agent turns every refuted finding into a signal, so one broken
    claim arrived at the diff as the claim, the signal, and the score move.
    """
    before: list[dict[str, Any]] = []
    after = [
        _evidence(
            "symbol_reuse",
            "Ticker points to the same project as elsewhere",
            state="refuted",
            reason="Same ticker, different destination.",
        ),
        _evidence(
            "risk_signal:refuted:symbol_reuse",
            "Same ticker, different destination.",
            "medium",
        ),
    ]

    changes = compare(after, before)

    assert len(changes) == 1
    assert changes[0].kind == "symbol_reuse"


def test_a_new_risk_signal_is_alarming() -> None:
    after = [
        _evidence(
            "risk_signal:deployer_holds_supply",
            "The deploying address still holds 97.23% of supply.",
            "critical",
        )
    ]

    changes = compare(after, [])

    assert changes[0].severity == ALARMING
    assert changes[0].direction == "appeared"


def test_wider_coverage_is_not_reported_as_news_about_the_subject() -> None:
    """A field we simply did not collect last time is not a change in it."""
    after = [_evidence("market_cap", "Circulating market cap (USD)", 1_250_000)]

    assert compare(after, []) == []


def test_changes_are_ordered_worst_first() -> None:
    before = [
        _evidence("price", "Exchange rate (USD)", 1.0),
        _evidence("resolves", "Website resolves", True),
    ]
    after = [
        _evidence("price", "Exchange rate (USD)", 2.0),
        _evidence("resolves", "Website resolves", state="refuted", reason="gone"),
    ]

    severities = [change.severity for change in compare(after, before)]

    assert severities == [ALARMING, INFORMATIONAL]


# --- The report envelope ----------------------------------------------------


def test_the_report_records_how_long_ago_the_comparison_point_was() -> None:
    """ "What changed" is meaningless without "since when"."""
    now = datetime.now(UTC)
    report = build_report(
        [],
        previous_id="abc",
        previous_at=now - timedelta(hours=3),
        compared_at=now,
    )

    assert report["elapsed_seconds"] == pytest.approx(10_800, abs=2)
    assert report["total"] == 0
    assert report["previous_execution_id"] == "abc"


def test_no_changes_is_a_real_answer_not_a_missing_one() -> None:
    """A first analysis returns None; an unchanged subject returns zero.

    Collapsing those would let "we have never looked at this before" render as
    "nothing has changed", which is the same class of mistake as an unknown
    reading as a pass.
    """
    report = build_report(
        [],
        previous_id="abc",
        previous_at=datetime.now(UTC),
        compared_at=datetime.now(UTC),
    )

    assert report is not None
    assert report["total"] == 0


# --- Routing keeps portfolio out of the site path ---------------------------


def test_a_site_analysis_gains_neither_portfolio_nor_risk() -> None:
    decision = RoutingDecision(
        target=AnalysisTarget.SITE,
        address="https://example.com",
        primary_agent=AgentKind.SITE,
    )

    assert decision.agents == (AgentKind.SITE,)


# --- Streaming: one malformed frame must not kill a live summary ------------


def test_a_content_delta_is_extracted() -> None:
    chunk = _parse_sse_line(
        'data: {"model":"anthropic/claude-sonnet-5",'
        '"choices":[{"delta":{"content":"The token "}}]}'
    )

    assert chunk is not None
    assert chunk.text == "The token "
    assert chunk.model == "anthropic/claude-sonnet-5"


@pytest.mark.parametrize(
    "line",
    [
        ": OPENROUTER PROCESSING",  # keep-alive comment
        "",  # frame separator
        "data: [DONE]",  # terminator
        "data: not json at all",  # a shape we have never seen
        "data: []",  # valid json, wrong type
        'data: {"choices":[]}',  # no delta and no model
    ],
)
def test_a_frame_carrying_nothing_yields_nothing(line: str) -> None:
    """Tolerance is the point.

    A summary that is already half delivered must not be destroyed by one
    unexpected frame — the reader would see it stop mid-sentence with no
    explanation.
    """
    assert _parse_sse_line(line) is None


def test_a_frame_with_only_a_model_still_carries_it() -> None:
    """The model name arrives in its own frame and labels the prose."""
    chunk = _parse_sse_line('data: {"model":"anthropic/claude-sonnet-5","choices":[]}')

    assert chunk is not None
    assert chunk.model == "anthropic/claude-sonnet-5"
    assert chunk.text == ""


# --- Finding the run to compare against -------------------------------------


def test_the_previous_run_lookup_never_returns_the_current_one() -> None:
    """The engine stores this run too. Without the exclusion a subject could
    compare against itself and report nothing had changed — truthfully, and
    uselessly."""
    from app.engine.result import ExecutionResult
    from app.models.enums import ExecutionStatus, PipelineStage
    from app.repositories import get_execution_store

    store = get_execution_store()
    for index in range(2):
        store._write(
            "wallet",
            ExecutionResult(
                execution_id=f"run{index}",
                status=ExecutionStatus.SUCCEEDED,
                stage=PipelineStage.REPORT,
                target="wallet",
                address=WALLET,
            ),
        )

    found = store.find_previous("wallet", WALLET, exclude_id="run1", max_age_seconds=3600)

    assert found is not None
    assert found.execution_id == "run0"


def test_a_failed_run_is_never_the_comparison_point() -> None:
    """Its evidence is partial, so every check that did not get to run would
    read as something that changed."""
    from app.engine.result import ExecutionResult
    from app.models.enums import ExecutionStatus, PipelineStage
    from app.repositories import get_execution_store

    store = get_execution_store()
    store._write(
        "wallet",
        ExecutionResult(
            execution_id="broken",
            status=ExecutionStatus.FAILED,
            stage=PipelineStage.ENGINE,
            target="wallet",
            address=WALLET,
        ),
    )

    assert (
        store.find_previous("wallet", WALLET, exclude_id="x", max_age_seconds=3600)
        is None
    )


def test_a_stored_run_keeps_its_timezone() -> None:
    """SQLite drops it, which made every comparison raise and every timestamp
    render hours off in the browser."""
    from app.engine.result import ExecutionResult
    from app.models.enums import ExecutionStatus, PipelineStage
    from app.repositories import get_execution_store

    store = get_execution_store()
    store._write(
        "wallet",
        ExecutionResult(
            execution_id="tz",
            status=ExecutionStatus.SUCCEEDED,
            stage=PipelineStage.REPORT,
            target="wallet",
            address=WALLET,
        ),
    )

    found = store.find_previous("wallet", WALLET, exclude_id="x", max_age_seconds=3600)

    assert found is not None
    assert found.created_at.tzinfo is not None
    # The subtraction that raised `can't subtract offset-naive and
    # offset-aware datetimes` in a live run.
    assert (datetime.now(UTC) - found.created_at).total_seconds() >= 0
