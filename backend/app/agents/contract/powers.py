"""What a contract's owner can do to a holder, read from its ABI.

The explorer shows a green "verified" tick and the source. Neither tells you
that the owner can mint without limit or swap the entire implementation. Both
are plainly visible in the ABI, so this reads them off directly.

Two mistakes are worth recording, because both were made and caught against
real contracts on this chain:

1. **Substring matching is wrong.** `acceptDefaultAdminTransfer` contains
   "mint" — ad-MIN-Transfer — and was reported as minting power on a contract
   that has none. Names are split into words first.
2. **A proxy's own ABI says nothing.** USDG is an EIP-1967 proxy whose ABI has
   zero functions; every power lives in the implementation. Scanning the proxy
   directly reports a clean contract that can in fact mint freely.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

#: Single words that name a power, mapped to what it means for a holder.
_POWERS: dict[str, str] = {
    "mint": "create new supply",
    "burn": "destroy tokens held by others",
    "pause": "freeze all transfers",
    "unpause": "unfreeze transfers",
    "blacklist": "block specific addresses",
    "blocklist": "block specific addresses",
    "freeze": "freeze specific balances",
    "seize": "take tokens from an address",
    "upgrade": "replace the contract's logic",
    "rescue": "withdraw tokens held by the contract",
    "withdraw": "withdraw funds held by the contract",
}

#: Powers that need two words in order, so "setFee" matches but "feeSetter"
#: does not.
#:
#: The second group was added after the bytecode recovery started working and
#: immediately exposed a hole: the vocabulary above was written from
#: stablecoin contracts (mint, freeze, upgrade), while the contracts that go
#: *unverified* are overwhelmingly the retail tax-token template. CASHDOG and
#: JOHN both recovered cleanly and then matched nothing at all, which made the
#: whole recovery worthless until these existed.
_PAIRS: dict[tuple[str, str], str] = {
    ("set", "fee"): "change fees",
    ("set", "tax"): "change taxes",
    ("set", "peer"): "redirect cross-chain routing",
    ("set", "minter"): "appoint new minters",
    ("transfer", "ownership"): "hand control to another address",
    ("grant", "role"): "grant privileged roles",
    # --- the tax-token launch template ---
    #: The sharpest of all of these. Until the owner calls it nobody can sell,
    #: which makes every other guarantee conditional on their cooperation.
    ("enable", "trading"): "decide when trading may begin",
    ("open", "trading"): "decide when trading may begin",
    ("start", "trading"): "decide when trading may begin",
    ("remove", "limits"): "change the transaction and wallet caps",
    ("set", "max"): "change the transaction and wallet caps",
    ("set", "limit"): "change the transaction and wallet caps",
    ("remove", "tax"): "change taxes",
    ("set", "bots"): "block specific addresses",
    ("add", "bots"): "block specific addresses",
    ("del", "bots"): "block specific addresses",
    ("exclude", "fee"): "exempt chosen addresses from fees",
    ("manual", "swap"): "move funds held by the contract",
    ("manual", "send"): "move funds held by the contract",
}

#: Powers severe enough that a holder should see them before buying.
_SEVERE = frozenset(
    {
        "create new supply",
        "replace the contract's logic",
        "freeze all transfers",
        "block specific addresses",
        "freeze specific balances",
        "take tokens from an address",
        "appoint new minters",
        #: A holder who cannot sell until an operator says so is in the same
        #: position as one holding a honeypot, for as long as that lasts.
        "decide when trading may begin",
    }
)

_WORD = re.compile(r"[A-Z]+(?![a-z])|[A-Z][a-z]*|[a-z]+|\d+")


@dataclass(frozen=True, slots=True)
class Power:
    function: str
    meaning: str

    @property
    def severe(self) -> bool:
        return self.meaning in _SEVERE


def _words(name: str) -> list[str]:
    """Split camelCase, PascalCase, and snake_case into lowercase words."""
    return [word.lower() for word in _WORD.findall(name)]


def _match(name: str) -> str | None:
    parts = _words(name)

    for word in parts:
        if word in _POWERS:
            return _POWERS[word]

    for (first, second), meaning in _PAIRS.items():
        if (
            first in parts
            and second in parts
            and parts.index(first) < parts.index(second)
        ):
            return meaning

    return None


def privileged_powers(abi: list[dict[str, Any]]) -> list[Power]:
    """Every state-changing function in `abi` that confers a notable power.

    Read-only functions are skipped: a `paused()` getter tells you the state,
    while `pause()` is the ability to set it.
    """
    found: dict[str, Power] = {}

    for entry in abi:
        if entry.get("type") != "function":
            continue
        if entry.get("stateMutability") in ("view", "pure"):
            continue

        name = entry.get("name")
        if not isinstance(name, str) or not name:
            continue

        meaning = _match(name)
        if meaning is not None and name not in found:
            found[name] = Power(function=name, meaning=meaning)

    return sorted(found.values(), key=lambda power: (not power.severe, power.function))
