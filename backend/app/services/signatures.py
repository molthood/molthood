"""Recovering a contract's interface when nobody published its source.

An unverified contract used to end the analysis: the power scan reads the ABI,
there is no ABI, and the report said only "the source is unverified, so it
could not be scanned for dangerous patterns". That is an honest `unknown`, and
it is also the answer for roughly one in eight of the most-traded tokens on
this chain — which makes it the largest single gap in what the platform can
say.

The gap is closable. A Solidity contract dispatches calls by comparing the
first four bytes of the calldata against a table of function selectors, and
that table is in the deployed bytecode whether or not the source was
published. The selectors are one-way hashes of the signature, but they are
hashes of *public* text, and openchain.xyz maintains the reverse index.

Measured against USDG's implementation, whose real ABI the explorer publishes:
**54 of 54 functions recovered.** The twelve extra candidates were almost all
custom errors, which use the same selector scheme and are filtered below.

No key, no account, no rate limit worth planning around.
"""

from __future__ import annotations

import re
from typing import Any

from app.logging import get_logger
from app.services.http import ResilientHTTPClient, TimeoutPolicy

logger = get_logger(__name__)

#: `PUSH4 <selector>` is how the dispatcher loads each entry of its jump table.
#: Matching the whole bytecode rather than parsing it properly over-collects,
#: which is the right direction to err: an unresolvable candidate is dropped,
#: and only a name the registry actually knows is ever reported.
_PUSH4 = re.compile(r"63([0-9a-f]{8})")

#: Selectors that appear in almost every contract and mean nothing on their own.
_NOISE: frozenset[str] = frozenset(
    {
        "ffffffff",  # a padding artifact, resolves to a joke signature
        "4e487b71",  # Panic(uint256), emitted by the compiler
    }
)

#: Solidity's naming convention, used as the discriminator between a function
#: and an error.
#:
#: Errors are PascalCase noun phrases (`InsufficientFunds`, `ContractPaused`);
#: functions are camelCase verbs (`enableTrading`, `transferFrom`). Keyword
#: lists were tried first and did not hold — `ContractPaused` contains none of
#: the obvious error words. The case rule did hold: measured against USDG's
#: published ABI, every one of the ten false candidates was PascalCase or
#: SCREAMING_CASE, and every one of the 54 real functions was camelCase.
#:
#: SCREAMING_CASE (`DOMAIN_SEPARATOR`) is a constant getter — a view function,
#: which the power scan skips anyway, and never a power.
_FUNCTION_SHAPED = re.compile(r"^[a-z_$][A-Za-z0-9_$]*$")

#: A contract's dispatch table is small; a page of candidates is generous.
_MAX_SELECTORS = 200

#: The registry answers in well under a second, but it is enrichment — an
#: analysis is complete without it and must not wait on it.
_TIMEOUT = TimeoutPolicy(connect_seconds=4.0, read_seconds=12.0)


def extract_selectors(bytecode: str) -> list[str]:
    """Every four-byte selector that appears in deployed bytecode."""
    if not bytecode or bytecode in ("0x", "0X"):
        return []

    found = {
        match.group(1)
        for match in _PUSH4.finditer(bytecode.lower())
        if match.group(1) not in _NOISE
    }
    return sorted(found)[:_MAX_SELECTORS]


def looks_like_an_error(name: str) -> bool:
    """Whether a recovered name is a revert reason rather than a function.

    Errs toward discarding. A dropped name costs one finding; a kept error
    could be reported as a privileged power that does not exist, which is
    exactly the kind of confident-and-wrong claim this platform exists to
    catch other people making.
    """
    return not _FUNCTION_SHAPED.match(name)


class SignatureClient:
    """Reverse lookup for four-byte function selectors.

    Wraps the transport directly rather than extending `BaseServiceClient`,
    like the rest of the web-intelligence clients. That base class exists for
    services with a credential and a readiness state; this one has neither and
    would only add a "not configured" row to `/status` that no operator could
    ever act on.
    """

    def __init__(self, *, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self._http = ResilientHTTPClient(
            service="openchain",
            base_url=self.base_url,
            timeout=_TIMEOUT,
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    async def lookup(self, selectors: list[str]) -> dict[str, str]:
        """Map each selector to a signature, skipping any the registry lacks.

        A selector with no entry is simply absent from the result. That is a
        genuine unknown — the function exists in the contract, we just cannot
        name it — and it must not be invented.
        """
        if not selectors:
            return {}

        normalised = [
            selector if selector.startswith("0x") else f"0x{selector}"
            for selector in selectors
        ]

        payload = await self._http.get_json(
            "/signature-database/v1/lookup",
            params={"function": ",".join(normalised), "filter": "true"},
            operation="lookup",
        )

        if not isinstance(payload, dict):
            return {}

        functions = (payload.get("result") or {}).get("function")
        if not isinstance(functions, dict):
            return {}

        resolved: dict[str, str] = {}
        for selector, matches in functions.items():
            if not isinstance(matches, list) or not matches:
                continue
            first = matches[0]
            if isinstance(first, dict) and isinstance(first.get("name"), str):
                resolved[str(selector).lower()] = first["name"]

        return resolved

    async def recover_abi(self, bytecode: str) -> list[dict[str, Any]]:
        """Name what a contract can do, shaped like the ABI we could not fetch.

        Returning ABI-shaped entries means the existing power scan works
        unchanged on a contract that was never verified.

        `stateMutability` is deliberately left as `nonpayable`: bytecode does
        not record it, and guessing would let a read-only getter be reported as
        a power. The scan already skips `view` and `pure`, so this errs toward
        *examining* a function rather than dismissing it.
        """
        selectors = extract_selectors(bytecode)
        if not selectors:
            return []

        try:
            resolved = await self.lookup(selectors)
        except Exception as exc:
            logger.warning("signature_lookup_failed", error=str(exc))
            return []

        entries: list[dict[str, Any]] = []
        for signature in resolved.values():
            name = signature.split("(", 1)[0]
            if not name or looks_like_an_error(name):
                continue
            entries.append(
                {
                    "type": "function",
                    "name": name,
                    "stateMutability": "nonpayable",
                    "inputs": [],
                    "recovered": True,
                }
            )

        return entries
