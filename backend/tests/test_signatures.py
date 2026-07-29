"""Reading an unverified contract's interface out of its bytecode.

Roughly one in eight of the most-traded tokens on this chain publishes no
source, and for those the power scan used to return nothing at all. These
tests guard the recovery and, just as importantly, the two ways it could
produce a *wrong* claim rather than a missing one.
"""

from __future__ import annotations

import pytest

from app.agents.contract.powers import privileged_powers
from app.services.signatures import (
    extract_selectors,
    looks_like_an_error,
)

#: `transfer(address,uint256)` preceded by PUSH4, as a dispatcher emits it.
TRANSFER = "63a9059cbb"
APPROVE = "63095ea7b3"


# --- Pulling selectors out of bytecode --------------------------------------


def test_selectors_are_recovered_from_bytecode() -> None:
    found = extract_selectors(f"0x6080604052{TRANSFER}5b{APPROVE}00")

    assert "a9059cbb" in found
    assert "095ea7b3" in found


def test_an_empty_account_yields_nothing() -> None:
    """An address with no code is a wallet, not an unverified contract."""
    assert extract_selectors("0x") == []
    assert extract_selectors("") == []


def test_compiler_noise_is_dropped() -> None:
    """`Panic(uint256)` is in every contract and says nothing about this one."""
    assert extract_selectors(f"0x634e487b71{TRANSFER}") == ["a9059cbb"]


def test_the_candidate_list_is_bounded() -> None:
    """A hostile or enormous contract must not produce an unbounded request."""
    bytecode = "0x" + "".join(f"63{index:08x}" for index in range(1000))

    assert len(extract_selectors(bytecode)) <= 200


def test_selectors_are_deduplicated() -> None:
    assert extract_selectors(f"0x{TRANSFER}{TRANSFER}{TRANSFER}") == ["a9059cbb"]


# --- Errors are not powers --------------------------------------------------


#: Every candidate USDG's bytecode produced that was *not* in its published
#: ABI. Kept verbatim, because this list is the evidence the case rule works.
USDG_FALSE_CANDIDATES = [
    "BalanceOverflow",
    "ContractPaused",
    "InsufficientAllowance",
    "InsufficientFunds",
    "LOCK8605463013",
    "Panic",
    "RateOverflow",
    "SharesOverflow",
    "ZeroAddress",
    "ZeroValue",
]

#: A sample of the 54 that genuinely were.
USDG_REAL_FUNCTIONS = [
    "acceptDefaultAdminTransfer",
    "increaseSupplyToAddress",
    "mint",
    "transferFromBatch",
    "upgradeToAndCall",
]


@pytest.mark.parametrize("name", USDG_FALSE_CANDIDATES)
def test_a_revert_reason_is_not_reported_as_a_function(name: str) -> None:
    """Solidity errors share the selector scheme and surface identically.

    A keyword list was tried first and failed on `ContractPaused`, which
    contains none of the obvious error words. The naming convention held
    instead: errors are PascalCase nouns, functions are camelCase verbs.
    """
    assert looks_like_an_error(name)


@pytest.mark.parametrize(
    "name", [*USDG_REAL_FUNCTIONS, "enableTrading", "removeLimits", "setFee"]
)
def test_a_real_function_is_not_mistaken_for_an_error(name: str) -> None:
    assert not looks_like_an_error(name)


# --- The vocabulary the recovery actually needs -----------------------------


def _abi(*names: str) -> list[dict[str, object]]:
    return [{"type": "function", "name": name} for name in names]


def test_the_launch_gate_is_recognised_and_severe() -> None:
    """The sharpest power in a retail token, and it was invisible.

    Until the owner calls `enableTrading` nobody can sell, which puts a holder
    in the same position as a honeypot for as long as it lasts. JOHN on this
    chain has it, with ownership still held.
    """
    powers = privileged_powers(_abi("enableTrading"))

    assert len(powers) == 1
    assert powers[0].meaning == "decide when trading may begin"
    assert powers[0].severe


def test_the_tax_token_template_is_covered() -> None:
    """The hole that made bytecode recovery worthless on its first run.

    The vocabulary had been written from stablecoins — mint, freeze, upgrade —
    while the contracts that go unverified are overwhelmingly this template.
    CASHDOG recovered 25 functions cleanly and matched none of them.
    """
    powers = privileged_powers(
        _abi("removeLimits", "removeTransferTax", "manualSwap", "setBots")
    )
    meanings = {power.meaning for power in powers}

    assert "change the transaction and wallet caps" in meanings
    assert "change taxes" in meanings
    assert "move funds held by the contract" in meanings
    assert "block specific addresses" in meanings


def test_ordinary_erc20_functions_are_not_powers() -> None:
    """The scan has to stay quiet on a plain token, or it means nothing."""
    assert privileged_powers(_abi("transfer", "approve", "balanceOf", "symbol")) == []


def test_a_getter_is_not_the_power_it_reports_on() -> None:
    """`paused()` tells you the state; `pause()` is the ability to set it."""
    abi = [
        {"type": "function", "name": "paused", "stateMutability": "view"},
        {"type": "function", "name": "maxWalletSize", "stateMutability": "view"},
    ]

    assert privileged_powers(abi) == []


def test_word_boundaries_still_hold_for_the_new_entries() -> None:
    """The original bug, re-checked against the words just added.

    `acceptDefaultAdminTransfer` contains "min" and was once reported as
    minting power. Nothing added here may reintroduce substring matching.
    """
    powers = privileged_powers(
        _abi("acceptDefaultAdminTransfer", "maxWalletSize", "totalTaxCollected")
    )

    assert powers == []


# --- Volume that no pool could have supported ------------------------------


class _Security:
    """Stands in for a GoPlus response, carrying only what the check reads."""

    def __init__(self, liquidity: float | None) -> None:
        self.liquidity_usd = liquidity


def _volume_check(liquidity: float | None, volume: float | None) -> list[object]:
    from app.agents.market.agent import MarketAgent

    facts: dict[str, object] = {"volume_24h_usd": volume}
    return list(MarketAgent._check_volume_is_backed(_Security(liquidity), facts))


def test_volume_far_beyond_the_pool_is_a_contradiction() -> None:
    """CASHDOG: $284,189,685 of reported volume against $381 of pool.

    The strongest check the platform has, and it needed no new source — GoPlus
    was already returning pool depth and the field was being thrown away.
    """
    findings = _volume_check(381.0, 284_189_685.0)

    assert len(findings) == 1
    assert findings[0].state.value == "refuted"  # type: ignore[attr-defined]
    # Both figures have to appear, because the finding's whole value is that a
    # reader can see the two sources disagreeing rather than take our word.
    reason = findings[0].reason  # type: ignore[attr-defined]
    assert "$284,189,685" in reason
    assert "$381" in reason


def test_a_deep_market_is_confirmed_not_flagged() -> None:
    """USDG turns over 40x a day on a $12.5M pool. That is what healthy is.

    The threshold has to leave real markets alone or the signal means nothing.
    """
    findings = _volume_check(12_491_270.0, 502_639_616.0)

    assert findings[0].state.value == "confirmed"  # type: ignore[attr-defined]


def test_no_pool_data_is_unknown_rather_than_an_accusation() -> None:
    """GoPlus indexes a limited set of DEXes.

    Absent pool data means it did not look, not that no market exists —
    trading may be happening somewhere it cannot see.
    """
    findings = _volume_check(None, 22_328_266.0)

    assert findings[0].state.value == "unknown"  # type: ignore[attr-defined]


def test_an_indexed_but_empty_pool_is_still_unknown() -> None:
    """Zero is a measurement, but it is a measurement of GoPlus's coverage.

    Reporting "this token has no market" from it would be a stronger claim
    than the data carries.
    """
    findings = _volume_check(0.0, 3_629_619.0)

    assert findings[0].state.value == "unknown"  # type: ignore[attr-defined]


def test_a_token_with_no_reported_volume_is_not_checked() -> None:
    """Nothing to corroborate, so nothing to say about it."""
    assert _volume_check(1000.0, 0.0) == []
    assert _volume_check(1000.0, None) == []
