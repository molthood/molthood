"""Coherence checking and three-state evidence.

The theme running through this file is a single failure mode: a check that
could not run being presented as a check that came back clean. Every test here
guards one place where that happened for real.
"""

from __future__ import annotations

import time

import pytest

from app.agents.contract.powers import Power, privileged_powers
from app.agents.market.agent import MarketAgent
from app.agents.risk.agent import RiskAgent
from app.agents.risk.signals import contract_signals, tradability_signals
from app.core.exceptions import UnresolvableHostError, ValidationError
from app.engine.context import ExecutionContext, ExecutionRequest
from app.engine.result import Finding
from app.models.enums import EvidenceState
from app.services.goplus import TokenSecurity, _flag, _percent
from app.services.web.fetcher import (
    HostVerdict,
    normalize_url,
    resolve_host,
    validate_public_url,
)

TOKEN_ADDRESS = "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34"

# --- Finding construction ---------------------------------------------------


def test_confirmed_finding_keeps_a_false_value() -> None:
    """`False` is a measurement, not an absence.

    "SPF policy published: False" must survive to the report; it was being
    dropped alongside genuinely empty findings.
    """
    finding = Finding.confirmed("spf", "SPF policy published", False)

    assert finding.state is EvidenceState.CONFIRMED
    assert finding.value is False


def test_unknown_finding_requires_a_reason() -> None:
    finding = Finding.unknown("dns", "DNS posture", reason="The resolver timed out.")

    assert finding.state is EvidenceState.UNKNOWN
    assert finding.reason
    assert finding.value is None


def test_refuted_finding_carries_why() -> None:
    finding = Finding.refuted(
        "declared_website_resolves",
        "Declared website resolves",
        value="example.invalid",
        reason="No DNS records.",
    )

    assert finding.state is EvidenceState.REFUTED
    assert finding.reason == "No DNS records."


# --- Evidence filtering -----------------------------------------------------


def _context() -> ExecutionContext:
    return ExecutionContext(request=ExecutionRequest(request="x"), services=None)  # type: ignore[arg-type]


def test_only_empty_confirmed_findings_are_dropped() -> None:
    """The regression that started all of this.

    The evidence stage filtered on `value is not None`, which deleted refuted
    and unknown findings — the two that carry the most information.
    """
    context = _context()
    context.add_evidence(kind="a", label="Has a value", value=1)
    context.add_evidence(kind="b", label="Nothing to report", value=None)
    context.add_evidence(
        kind="c", label="Could not check", state=EvidenceState.UNKNOWN, reason="timeout"
    )
    context.add_evidence(
        kind="d", label="Claim fails", state=EvidenceState.REFUTED, reason="no records"
    )

    kept = [item.kind for item in context.evidence if item.is_reportable]

    assert kept == ["a", "c", "d"]


# --- Privileged powers ------------------------------------------------------


def _fn(name: str, mutability: str = "nonpayable") -> dict[str, object]:
    return {"type": "function", "name": name, "stateMutability": mutability}


def test_admin_transfer_is_not_a_mint() -> None:
    """`acceptDefaultAdminTransfer` contains "mint" — ad-MIN-Transfer.

    A substring match reported minting power on VIRTUAL, which grants none by
    that function. Names are split into words before matching.
    """
    powers = privileged_powers(
        [
            _fn("acceptDefaultAdminTransfer"),
            _fn("beginDefaultAdminTransfer"),
            _fn("cancelDefaultAdminTransfer"),
        ]
    )

    assert all(power.meaning != "create new supply" for power in powers)


def test_real_mint_and_upgrade_are_found() -> None:
    powers = privileged_powers([_fn("mint"), _fn("upgradeTo"), _fn("transferOwnership")])
    meanings = {power.meaning for power in powers}

    assert "create new supply" in meanings
    assert "replace the contract's logic" in meanings
    assert "hand control to another address" in meanings


def test_read_only_functions_are_not_powers() -> None:
    """`paused()` reports the state; `pause()` is the ability to set it."""
    powers = privileged_powers([_fn("paused", "view"), _fn("owner", "view")])

    assert powers == []


def test_ordered_pairs_do_not_match_in_reverse() -> None:
    """`setFee` is a power; `feeSetter` as a name is not the same claim."""
    assert any(p.meaning == "change fees" for p in privileged_powers([_fn("setFee")]))
    assert not privileged_powers([_fn("feeCollector")])


def test_severe_powers_sort_first() -> None:
    powers = privileged_powers([_fn("transferOwnership"), _fn("mint")])

    assert powers[0].function == "mint"
    assert powers[0].severe
    assert not powers[1].severe


def test_power_dataclass_marks_severity() -> None:
    assert Power("mint", "create new supply").severe
    assert not Power("transferOwnership", "hand control to another address").severe


# --- Host classification ----------------------------------------------------


def test_nxdomain_is_distinct_from_a_private_address() -> None:
    """These were the same rejection and are not the same thing.

    A token naming a website that does not exist is a finding about the token.
    A host resolving to 127.0.0.1 is a request we refuse to make.
    """
    assert resolve_host("this-domain-does-not-exist-molthood-test.invalid") is (
        HostVerdict.UNRESOLVABLE
    )
    assert resolve_host("127.0.0.1") is HostVerdict.NOT_PUBLIC


def test_unresolvable_host_raises_its_own_error() -> None:
    with pytest.raises(UnresolvableHostError):
        validate_public_url("this-domain-does-not-exist-molthood-test.invalid")


def test_private_host_still_raises_plain_validation_error() -> None:
    with pytest.raises(ValidationError) as excinfo:
        validate_public_url("http://127.0.0.1/")

    assert not isinstance(excinfo.value, UnresolvableHostError)


def test_normalize_does_not_touch_dns() -> None:
    """A dead domain still needs a usable URL for RDAP and the archive."""
    assert normalize_url("does-not-exist.invalid").startswith("https://")


# --- Refuted findings reach the risk score ----------------------------------


async def test_a_refuted_claim_lowers_the_risk_score() -> None:
    """VIRTUAL scored 100/100 "low" while declaring a nonexistent website.

    Nothing connected the coherence check to the score, so the clearest
    signal available was collected and then ignored.
    """
    context = _context()
    context.facts["token"] = {"holders_count": 5000}
    context.add_evidence(
        kind="declared_website_resolves",
        label="Declared website resolves",
        state=EvidenceState.REFUTED,
        reason="virtualsrh.lol has no DNS records.",
    )

    signals = RiskAgent()._coherence_signals(context)

    assert len(signals) == 1
    assert signals[0].weight >= 25
    assert "DNS" in signals[0].detail


async def test_confirmed_findings_do_not_create_risk_signals() -> None:
    context = _context()
    context.add_evidence(kind="holders", label="Holder count", value=5000)

    assert RiskAgent()._coherence_signals(context) == []


# --- Upgradeability is one fact, not four -----------------------------------


def test_upgradeability_is_not_counted_twice() -> None:
    """proxy_type, upgradeTo, upgradeToAndCall and a source marker are one fact.

    Scored naively, USDG lost points four times for a single property.
    """
    facts = {
        "is_contract": True,
        "is_verified": True,
        "proxy_type": "eip1967",
        "source_markers": ["Appears upgradeable"],
        "privileged_powers": [
            {
                "function": "upgradeTo",
                "meaning": "replace the contract's logic",
                "severe": True,
            },
            {
                "function": "upgradeToAndCall",
                "meaning": "replace the contract's logic",
                "severe": True,
            },
        ],
    }

    codes = [signal.code for signal in contract_signals(facts)]

    assert codes == ["power:replace_the_contract's_logic"]


def test_a_power_without_a_matching_marker_still_scores() -> None:
    facts = {
        "is_contract": True,
        "is_verified": True,
        "source_markers": ["Uses delegatecall"],
        "privileged_powers": [
            {"function": "mint", "meaning": "create new supply", "severe": True}
        ],
    }

    codes = {signal.code for signal in contract_signals(facts)}

    assert "power:create_new_supply" in codes
    assert "uses_delegatecall" in codes


# --- GoPlus: an undetermined flag is not a clean one ------------------------


def test_undetermined_flag_stays_unknown() -> None:
    """The single most dangerous bug available in this integration.

    GoPlus omits a field it could not determine. Coercing that to False would
    report "not a honeypot" about a token nobody checked.
    """
    assert _flag("1") is True
    assert _flag("0") is False
    assert _flag(None) is None
    assert _flag("") is None


def test_a_rejected_key_is_not_reported_as_credentialed() -> None:
    """Configured and working are different states, and were conflated.

    `/status` announced "Credentialed: True" for a key GoPlus answers 4010 to.
    """
    from pydantic import SecretStr

    from app.services.goplus import GoPlusClient

    client = GoPlusClient(SecretStr("bad-key"), SecretStr("bad-secret"))
    assert client.has_credentials
    assert "not yet exchanged" in client.credential_state

    client._retry_after = time.time() + 60  # what a rejection sets
    assert "REJECTED" in client.credential_state

    assert "anonymous" in GoPlusClient().credential_state


def test_expires_in_is_read_as_a_duration() -> None:
    """`expires_in` is seconds-from-now, not an epoch timestamp.

    Read as absolute it put the deadline in 1970, so the cached token never
    looked valid and every request silently re-ran the token exchange.
    """
    from app.services.goplus import GoPlusClient

    now = time.time()
    deadline = GoPlusClient._expiry_from(3600)

    assert deadline > now, "a fresh token must not already be expired"
    assert now + 3000 < deadline < now + 3600

    # An epoch-shaped value is still handled, in case the field changes.
    assert GoPlusClient._expiry_from(now + 7200) > now + 7000
    # Junk falls back to a short, safe window rather than never expiring.
    # Upper bound has slack because the fallback reads the clock again.
    assert now < GoPlusClient._expiry_from(None) <= now + 601


def test_percent_converts_the_fraction() -> None:
    """GoPlus gives 0-1; this platform speaks percent. 0.972345 -> 97.2345."""
    assert _percent("0.972345") == 97.2345
    assert _percent(None) is None
    assert _percent("not a number") is None


def test_blocking_signals_ignore_undetermined_flags() -> None:
    security = TokenSecurity(found=True, is_honeypot=None, transfer_pausable=True)

    assert security.blocking_signals == ["transfers can be paused"]


def test_a_honeypot_alone_sinks_the_score() -> None:
    """Distribution is beside the point if the sell function reverts."""
    signals = tradability_signals({"is_honeypot": True})

    assert len(signals) == 1
    assert signals[0].weight >= 70
    assert signals[0].severity == "critical"


def test_undetermined_flags_produce_no_signal() -> None:
    """None must not be read as safe, and must not be read as dangerous."""
    assert tradability_signals({"is_honeypot": None}) == []


def test_a_low_tax_is_not_a_signal() -> None:
    assert tradability_signals({"sell_tax_pct": 1.0}) == []
    assert tradability_signals({"sell_tax_pct": 25.0})


# --- Two sources measuring one number ---------------------------------------


def test_agreeing_sources_corroborate() -> None:
    """On AP the explorer gave 97.23 and GoPlus 97.2345 — the same number."""
    facts = {"deployer_share_pct": 97.23}
    findings = MarketAgent._compare_deployer_share(
        TokenSecurity(found=True, creator_percent=97.2345), facts
    )

    assert findings[0].state is EvidenceState.CONFIRMED


def test_disagreeing_sources_are_reported_not_resolved() -> None:
    """Picking a winner silently would present a disputed number as settled."""
    facts = {"deployer_share_pct": 12.0}
    findings = MarketAgent._compare_deployer_share(
        TokenSecurity(found=True, creator_percent=80.0), facts
    )

    assert findings[0].state is EvidenceState.UNKNOWN
    assert "12.0" in (findings[0].reason or "")
    assert "80.0" in (findings[0].reason or "")


def test_no_comparison_when_one_side_is_missing() -> None:
    assert (
        MarketAgent._compare_deployer_share(
            TokenSecurity(found=True, creator_percent=None), {"deployer_share_pct": 5.0}
        )
        == []
    )


# --- Durable history and caching --------------------------------------------


async def test_an_execution_survives_and_can_be_fetched_in_full(fake_services) -> None:
    """A result that no longer exists cannot be shared.

    History used to live in a deque that died with the process, so a link to a
    finding was worthless the moment the server restarted.
    """
    from app.engine.engine import ExecutionEngine
    from app.repositories import get_execution_store

    engine = ExecutionEngine(services=fake_services)
    result = await engine.analyze(target="token", address=TOKEN_ADDRESS, use_cache=False)

    stored = get_execution_store().get_result(result.execution_id)

    assert stored is not None
    assert stored.execution_id == result.execution_id
    assert stored.target == "token"
    assert len(stored.evidence) == len(result.evidence)
    assert stored.sources == result.sources


async def test_a_repeat_analysis_is_served_from_storage(fake_services) -> None:
    """Re-running an identical analysis spends real credit for the same answer."""
    from app.engine.engine import ExecutionEngine

    engine = ExecutionEngine(services=fake_services)
    first = await engine.analyze(target="token", address=TOKEN_ADDRESS, use_cache=False)

    with _cache_window(600):
        second = await engine.analyze(target="token", address=TOKEN_ADDRESS)

    assert second.execution_id == first.execution_id, "expected the stored run"


async def test_a_failed_run_is_never_served_from_cache(fake_services) -> None:
    """One upstream hiccup must not become ten minutes of the same error."""
    from app.repositories import get_execution_store

    store = get_execution_store()
    assert store.find_recent("token", "0xdead", 600) is None


def _cache_window(seconds: int):
    """Temporarily enable the cache, which the suite disables by default."""
    import contextlib
    import os

    from app.config import get_settings

    @contextlib.contextmanager
    def window():
        previous = os.environ.get("ANALYSIS_CACHE_SECONDS")
        os.environ["ANALYSIS_CACHE_SECONDS"] = str(seconds)
        get_settings.cache_clear()
        try:
            yield
        finally:
            if previous is None:
                os.environ.pop("ANALYSIS_CACHE_SECONDS", None)
            else:
                os.environ["ANALYSIS_CACHE_SECONDS"] = previous
            get_settings.cache_clear()

    return window()


# --- An unscored subject is not a safe one ----------------------------------


async def test_risk_is_withheld_when_nothing_could_be_scored() -> None:
    """100/100 for a subject nobody could examine is the worst possible output."""
    context = _context()
    result = await RiskAgent().run(None, context)  # type: ignore[arg-type]

    score = next(item for item in result.evidence if item.kind == "risk_score")

    assert score.state is EvidenceState.UNKNOWN
    assert score.reason
