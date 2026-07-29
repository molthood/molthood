"""The scoring rules, as pure functions over collected facts.

Split out of the Risk Agent so a token screened inside a portfolio is judged by
exactly the same rules as one analysed on its own. Two implementations of
"how risky is this token" would drift, and the moment they disagreed the
platform would be telling a reader two different things about one subject.

Nothing here performs I/O or reads the execution context: every function takes
a facts dictionary and returns signals. That is what makes them shareable.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Final


@dataclass(slots=True)
class RiskSignal:
    """One rule that fired, with the weight it contributed."""

    code: str
    severity: str
    detail: str
    weight: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "severity": self.severity,
            "detail": self.detail,
            "weight": self.weight,
        }


#: Concentration thresholds for the top-10 holder share.
CONCENTRATION_HIGH = 90.0
CONCENTRATION_MEDIUM = 70.0

#: Thresholds for how much of the supply the deploying address still holds.
DEPLOYER_SHARE_HIGH = 20.0
DEPLOYER_SHARE_MEDIUM = 5.0

#: A trade tax at or above this is material rather than incidental.
HIGH_TAX_PCT = 10.0

#: What each privileged owner power costs, keyed by meaning rather than
#: function name so two names for the same ability score once.
#:
#: These are trust assumptions, not accusations. A regulated stablecoin is
#: *expected* to be mintable and freezable; the score says the holder is
#: trusting an operator, which is a true and material statement about it.
POWER_WEIGHTS: Final[dict[str, tuple[int, str]]] = {
    "replace the contract's logic": (18, "high"),
    "create new supply": (15, "high"),
    "take tokens from an address": (20, "high"),
    "freeze all transfers": (12, "medium"),
    "block specific addresses": (12, "medium"),
    "freeze specific balances": (12, "medium"),
    "appoint new minters": (8, "medium"),
    #: A holder who cannot sell until an operator permits it is, for that
    #: period, in the same position as one holding a honeypot. Weighted above
    #: the others because it gates every exit rather than restricting one.
    #:
    #: This entry was missing when the power was first recognised, so it fell
    #: to the default of 8 and JOHN — whose owner is identified and can still
    #: call it — reported 92/100 "low". A severe power that costs eight points
    #: is not being scored, it is being mentioned.
    "decide when trading may begin": (25, "high"),
}
#: Only powers marked severe in `contract.powers` reach this table. The rest —
#: moving contract-held funds, adjusting caps, fee exemptions — are reported as
#: capabilities but not scored: they are ordinary for the token template they
#: come from, and scoring them would flood every retail token with signals that
#: distinguish nothing.


def score_for(signals: list[RiskSignal]) -> int:
    """Start at 100 and subtract.

    An empty signal list means nothing was found, not that the subject was
    proven safe — the caller is responsible for saying which of those it is.
    """
    return max(0, 100 - sum(signal.weight for signal in signals))


def level_for(score: int) -> str:
    if score >= 80:
        return "low"
    if score >= 60:
        return "moderate"
    if score >= 35:
        return "elevated"
    return "high"


def tradability_signals(security: dict[str, Any]) -> list[RiskSignal]:
    """Whether a holder can get out, and what stands between them and it.

    A honeypot is the one condition where every other signal is beside the
    point: the token can look perfectly distributed and still be unsellable. It
    carries enough weight to sink the score on its own.

    Only `True` fires a signal. A `None` means GoPlus could not determine the
    flag, and treating that as "safe" is exactly the mistake the evidence model
    exists to prevent — the gap is reported as an unknown finding instead.
    """
    if not security:
        return []

    checks: tuple[tuple[str, str, str, int], ...] = (
        ("is_honeypot", "honeypot", "GoPlus reports this token cannot be sold.", 70),
        ("cannot_sell_all", "partial_sell_block", "The full balance cannot be sold.", 40),
        (
            "transfer_pausable",
            "transfers_pausable",
            "Transfers can be paused by the owner.",
            15,
        ),
        (
            "is_blacklisted",
            "blacklist",
            "Addresses can be blacklisted from transferring.",
            15,
        ),
        ("hidden_owner", "hidden_owner", "The contract has a hidden owner.", 30),
        (
            "can_take_back_ownership",
            "reclaimable_ownership",
            "Ownership can be reclaimed after being renounced.",
            25,
        ),
    )

    signals: list[RiskSignal] = []
    for key, code, detail, weight in checks:
        if security.get(key) is True:
            signals.append(
                RiskSignal(code, "critical" if weight >= 40 else "high", detail, weight)
            )

    for key, label in (("buy_tax_pct", "Buy"), ("sell_tax_pct", "Sell")):
        tax = security.get(key)
        if isinstance(tax, int | float) and tax >= HIGH_TAX_PCT:
            signals.append(
                RiskSignal(f"{label.lower()}_tax", "high", f"{label} tax is {tax}%.", 20)
            )

    return signals


def token_signals(facts: dict[str, Any]) -> list[RiskSignal]:
    """Distribution, tradability, and reputation for one token."""
    if not facts:
        return []

    signals: list[RiskSignal] = []

    share = facts.get("top10_holder_share_pct")
    if isinstance(share, int | float):
        if share >= CONCENTRATION_HIGH:
            signals.append(
                RiskSignal(
                    "holder_concentration_extreme",
                    "high",
                    f"Top 10 holders control {share}% of supply.",
                    25,
                )
            )
        elif share >= CONCENTRATION_MEDIUM:
            signals.append(
                RiskSignal(
                    "holder_concentration_high",
                    "medium",
                    f"Top 10 holders control {share}% of supply.",
                    12,
                )
            )

    # The deployer still sitting on the supply is a sharper signal than
    # concentration alone: it names *who*, and it is the shape a rug takes.
    # Verified across this chain's 25 most-traded tokens, where it fires twice
    # — once at 97.23%.
    deployer_share = facts.get("deployer_share_pct")
    if isinstance(deployer_share, int | float) and deployer_share > 0:
        if deployer_share >= DEPLOYER_SHARE_HIGH:
            signals.append(
                RiskSignal(
                    "deployer_holds_supply",
                    "critical",
                    f"The deploying address still holds {deployer_share}% of supply.",
                    35,
                )
            )
        elif deployer_share >= DEPLOYER_SHARE_MEDIUM:
            signals.append(
                RiskSignal(
                    "deployer_holds_stake",
                    "high",
                    f"The deploying address still holds {deployer_share}% of supply.",
                    18,
                )
            )

    signals.extend(tradability_signals(facts.get("security") or {}))

    holders = facts.get("holders_count")
    if isinstance(holders, int) and holders < 100:
        signals.append(
            RiskSignal(
                "few_holders",
                "medium",
                f"Only {holders} holders — distribution is very narrow.",
                12,
            )
        )

    volume = facts.get("volume_24h_usd")
    if volume is not None and volume == 0:
        signals.append(
            RiskSignal("no_volume", "medium", "No 24h trading volume recorded.", 10)
        )

    if facts.get("reputation") not in (None, "ok"):
        signals.append(
            RiskSignal(
                "reputation_flag",
                "high",
                f"Explorer reputation is '{facts['reputation']}'.",
                25,
            )
        )

    return signals


def contract_signals(facts: dict[str, Any]) -> list[RiskSignal]:
    """Verification state and the powers the owner retains."""
    if not facts:
        return []

    signals: list[RiskSignal] = []

    if facts.get("is_scam_flagged"):
        signals.append(
            RiskSignal(
                "scam_flagged",
                "critical",
                "Explorer has flagged this address as a scam.",
                60,
            )
        )

    if facts.get("is_contract") and facts.get("is_verified") is False:
        signals.append(
            RiskSignal(
                "unverified_source",
                "high",
                "Contract source is not verified on the explorer.",
                30,
            )
        )

    # Powers read from the ABI are authoritative: they are the functions that
    # exist, not text that happened to appear in the source. Where they overlap
    # a source marker or the proxy flag, the marker is suppressed —
    # upgradeability was previously counted four times over (proxy_type,
    # upgradeTo, upgradeToAndCall, and the "Appears upgradeable" marker),
    # quadrupling a single fact.
    powers = facts.get("privileged_powers") or []
    meanings = {
        power["meaning"]
        for power in powers
        if isinstance(power, dict) and power.get("severe")
    }

    for meaning in sorted(meanings):
        weight, severity = POWER_WEIGHTS.get(meaning, (8, "medium"))
        signals.append(
            RiskSignal(
                f"power:{meaning.replace(' ', '_')}",
                severity,
                f"The owner can {meaning}.",
                weight,
            )
        )

    can_upgrade = "replace the contract's logic" in meanings

    markers = facts.get("source_markers") or []
    marker_weights = {
        "Contains selfdestruct": ("high", 20),
        "Uses delegatecall": ("medium", 10),
        "Appears upgradeable": ("medium", 10),
        "References a blacklist": ("medium", 8),
        "Contains a mint path": ("medium", 8),
        "Has owner-gated functions": ("low", 4),
        "Has pause functionality": ("low", 4),
    }
    #: Markers that restate a power already scored from the ABI.
    superseded = {
        "Appears upgradeable": can_upgrade,
        "Contains a mint path": "create new supply" in meanings,
        "References a blacklist": "block specific addresses" in meanings,
        "Has pause functionality": "freeze all transfers" in meanings,
    }

    for marker in markers:
        if superseded.get(marker):
            continue
        severity, weight = marker_weights.get(marker, ("low", 3))
        signals.append(
            RiskSignal(marker.lower().replace(" ", "_"), severity, marker, weight)
        )

    # Only score the proxy separately when the ABI did not already show an
    # upgrade function; otherwise it is the same fact twice.
    if facts.get("proxy_type") and not can_upgrade:
        signals.append(
            RiskSignal(
                "proxy_contract",
                "medium",
                f"Proxy contract ({facts['proxy_type']}) — logic can change.",
                10,
            )
        )

    return signals


def wallet_signals(facts: dict[str, Any]) -> list[RiskSignal]:
    if not facts:
        return []

    signals: list[RiskSignal] = []

    if facts.get("is_scam_flagged"):
        signals.append(
            RiskSignal(
                "scam_flagged",
                "critical",
                "Explorer has flagged this address as a scam.",
                60,
            )
        )

    transactions = facts.get("transactions_count")
    if isinstance(transactions, int) and transactions == 0:
        signals.append(
            RiskSignal("no_activity", "low", "Address has no recorded transactions.", 5)
        )

    return signals
