"""GoPlus Security — an independent read on whether a token can be traded.

Everything else here answers "what does this token look like". This answers a
different question: *if I buy it, can I sell it again*. Nothing else in the
stack can, and it is the question that actually costs people money.

Verified against Robinhood Chain (4663) on 2026-07-28: all three tokens tried
returned complete data, and `creator_percent` independently reproduced the
97.23% deployer holding this platform measures from the explorer. Two sources
agreeing is worth as much as either alone; two sources *disagreeing* is a
finding, which is why this is added as a second opinion rather than a
replacement.

Credentials are optional. Anonymous access works and was measured at roughly
ten requests before throttling, which is enough for local use and not enough
for anything public.

The auth flow is unusual and is the reason this client does not simply extend
the shared base: there is no static header. A short-lived access token is
exchanged for a signature over the app key, a timestamp, and the app secret,
then cached until it expires.
"""

from __future__ import annotations

import asyncio
import hashlib
import time
from dataclasses import dataclass, field
from typing import Any, ClassVar

from pydantic import SecretStr

from app.logging import get_logger
from app.services.http import ResilientHTTPClient, RetryPolicy, TimeoutPolicy

logger = get_logger(__name__)

#: Robinhood Chain. GoPlus keys its endpoints by chain id in the path.
ROBINHOOD_CHAIN_ID = "4663"

#: Documented status codes worth handling by name.
CODE_OK = 1
CODE_PARTIAL = 2
CODE_APP_KEY_UNKNOWN = 4010
CODE_SIGNATURE_EXPIRED = 4011
CODE_SIGNATURE_WRONG = 4012
CODE_TOKEN_MISSING = 4023
CODE_RATE_LIMITED = 4029

_CODE_MEANING = {
    CODE_APP_KEY_UNKNOWN: "the app key is not recognised by GoPlus",
    CODE_SIGNATURE_EXPIRED: "the request signature had already been used",
    CODE_SIGNATURE_WRONG: "the request signature was rejected",
    CODE_TOKEN_MISSING: "the access token was not accepted",
    CODE_RATE_LIMITED: "the request limit was reached",
    2018: "GoPlus does not support this chain",
    2021: "GoPlus holds no information for this contract",
    2020: "the address is not a contract",
}

#: Refresh a little before expiry so a request never races the deadline.
_TOKEN_SKEW_SECONDS = 60

#: How long to stop retrying after credentials are rejected.
#:
#: Without this, a wrong app key costs a failed round-trip on *every* analysis
#: forever: the exchange fails, nothing is cached, and the next call tries
#: again. Rejection is a configuration problem that will not fix itself in the
#: next second, so the client backs off and keeps working anonymously.
_REJECTED_BACKOFF_SECONDS = 900


def _flag(raw: Any) -> bool | None:
    """GoPlus returns "0"/"1" strings, and omits a field it cannot determine.

    The three-way return matters: a missing flag means unknown, and must not
    collapse to False. Reporting "not a honeypot" because the field was absent
    would be the most dangerous possible bug in this file.
    """
    if raw in ("1", 1, True):
        return True
    if raw in ("0", 0, False):
        return False
    return None


def _percent(raw: Any) -> float | None:
    """GoPlus reports shares as a 0-1 fraction; this platform uses percent."""
    try:
        return round(float(raw) * 100, 4)
    except (TypeError, ValueError):
        return None


@dataclass(slots=True)
class TokenSecurity:
    """What GoPlus reports about a token's tradability and control."""

    found: bool = False
    #: None where GoPlus did not determine the flag — never assume False.
    is_honeypot: bool | None = None
    cannot_sell_all: bool | None = None
    transfer_pausable: bool | None = None
    is_blacklisted: bool | None = None
    is_mintable: bool | None = None
    hidden_owner: bool | None = None
    can_take_back_ownership: bool | None = None
    selfdestruct: bool | None = None
    is_proxy: bool | None = None
    is_open_source: bool | None = None
    buy_tax: float | None = None
    sell_tax: float | None = None
    owner_address: str | None = None
    owner_percent: float | None = None
    creator_address: str | None = None
    creator_percent: float | None = None
    holder_count: int | None = None
    lp_holder_count: int | None = None

    #: Total USD depth across every pool GoPlus indexes for this token.
    #:
    #: `None` means GoPlus reported no `dex` array at all — it does not know.
    #: `0.0` means it looked and found no pool. Those are different answers and
    #: the caller must not merge them: the first is a gap in coverage, the
    #: second is a statement about the token.
    liquidity_usd: float | None = None
    pools: int = 0
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def blocking_signals(self) -> list[str]:
        """Flags that mean a holder may be unable to exit."""
        checks = {
            "cannot be sold (honeypot)": self.is_honeypot,
            "cannot sell the full balance": self.cannot_sell_all,
            "transfers can be paused": self.transfer_pausable,
            "addresses can be blacklisted": self.is_blacklisted,
        }
        return [label for label, value in checks.items() if value is True]


class GoPlusError(Exception):
    """A GoPlus response that could not be used, with its documented meaning."""

    def __init__(self, code: int | None, message: str | None = None) -> None:
        meaning = _CODE_MEANING.get(code or 0) or message or "an unexpected response"
        super().__init__(f"GoPlus returned {code}: {meaning}")
        self.code = code


class GoPlusClient:
    """Token security lookups, with or without credentials."""

    base_url: ClassVar[str] = "https://api.gopluslabs.io"

    def __init__(
        self, app_key: SecretStr | None = None, app_secret: SecretStr | None = None
    ) -> None:
        # Both halves are needed to sign; one alone is the same as neither.
        self._app_key = app_key if app_key and app_secret else None
        self._app_secret = app_secret if app_key and app_secret else None
        self._token: str | None = None
        self._token_expires_at: float = 0.0
        #: Set after a rejection so the exchange is not retried per request.
        self._retry_after: float = 0.0
        self._lock = asyncio.Lock()
        self._http = ResilientHTTPClient(
            service="goplus",
            base_url=self.base_url,
            retry=RetryPolicy(max_attempts=2),
            timeout=TimeoutPolicy(connect_seconds=5.0, read_seconds=20.0),
        )

    @property
    def has_credentials(self) -> bool:
        """Whether a key pair is configured — not whether it works."""
        return self._app_key is not None

    @property
    def credential_state(self) -> str:
        """What the credentials are actually doing right now.

        `/status` reported "Credentialed: True" for a key GoPlus rejects,
        which is the same class of claim this platform exists to catch: a
        setting being present is not the setting working.
        """
        if self._app_key is None:
            return "anonymous (no key configured)"
        if time.time() < self._retry_after:
            return "key configured but REJECTED by GoPlus — using anonymous access"
        if self._token:
            return "authenticated"
        return "key configured, not yet exchanged"

    async def _access_token(self) -> str | None:
        """Exchange the signed credentials for a short-lived token.

        Returns None when unconfigured or when the exchange fails: anonymous
        access still works, so a bad key degrades the rate limit rather than
        the analysis.
        """
        if self._app_key is None or self._app_secret is None:
            return None

        async with self._lock:
            if time.time() < self._retry_after:
                return None
            if self._token and time.time() < self._token_expires_at:
                return self._token

            now = int(time.time())
            key = self._app_key.get_secret_value()
            raw = f"{key}{now}{self._app_secret.get_secret_value()}"
            signature = hashlib.sha1(raw.encode()).hexdigest()

            try:
                payload = await self._http.post_json(
                    "/api/v1/token",
                    json_body={"app_key": key, "time": now, "sign": signature},
                    operation="goplus_token",
                )
            except Exception as exc:
                logger.warning("goplus_token_exchange_failed", error=str(exc))
                self._retry_after = time.time() + _REJECTED_BACKOFF_SECONDS
                return None

            code = payload.get("code") if isinstance(payload, dict) else None
            if code != CODE_OK:
                # Logged rather than raised: the caller can still get an answer
                # anonymously. Backed off so a misconfigured key does not cost
                # a wasted round-trip on every subsequent analysis.
                logger.warning(
                    "goplus_credentials_rejected",
                    code=code,
                    meaning=_CODE_MEANING.get(code or 0, "unknown"),
                    retrying_in_seconds=_REJECTED_BACKOFF_SECONDS,
                )
                self._token = None
                self._token_expires_at = 0.0
                self._retry_after = time.time() + _REJECTED_BACKOFF_SECONDS
                return None

            result = payload.get("result") or {}
            token = result.get("access_token")
            expires = result.get("expires_in")

            if not isinstance(token, str):
                return None

            self._token = token
            self._token_expires_at = self._expiry_from(expires)
            self._retry_after = 0.0
            logger.info(
                "goplus_authenticated",
                valid_for_seconds=int(self._token_expires_at - time.time()),
            )
            return token

    @staticmethod
    def _expiry_from(expires: Any) -> float:
        """Turn GoPlus's `expires_in` into an absolute deadline.

        It is a *duration* in seconds, not an epoch timestamp. Reading it as
        absolute put the deadline in 1970, so the cached token never looked
        valid and every single request re-ran the exchange — the exact waste
        the cache exists to prevent, hidden because it still returned correct
        answers.

        Values that look like an epoch are accepted too, in case the field
        ever changes shape.
        """
        now = time.time()

        if not isinstance(expires, int | float) or expires <= 0:
            return now + 600.0

        # Anything past this is already an absolute timestamp, not a duration:
        # no sane token lives for three decades.
        if expires > 1_000_000_000:
            return max(now, float(expires)) - _TOKEN_SKEW_SECONDS

        return now + float(expires) - _TOKEN_SKEW_SECONDS

    async def token_security(
        self, address: str, chain_id: str = ROBINHOOD_CHAIN_ID
    ) -> TokenSecurity:
        """Read GoPlus's security assessment for one token."""
        token = await self._access_token()
        headers = {"Authorization": token} if token else None
        lowered = address.lower()

        payload = await self._http.get_json(
            f"/api/v1/token_security/{chain_id}",
            params={"contract_addresses": lowered},
            headers=headers,
            operation="goplus_token_security",
        )

        if not isinstance(payload, dict):
            raise GoPlusError(None, "the response body was not an object")

        code = payload.get("code")
        if code not in (CODE_OK, CODE_PARTIAL):
            raise GoPlusError(code, payload.get("message"))

        # The result is keyed by the lowercased address.
        result = (payload.get("result") or {}).get(lowered)
        if not isinstance(result, dict) or not result:
            return TokenSecurity(found=False)

        return TokenSecurity(
            found=True,
            is_honeypot=_flag(result.get("is_honeypot")),
            cannot_sell_all=_flag(result.get("cannot_sell_all")),
            transfer_pausable=_flag(result.get("transfer_pausable")),
            is_blacklisted=_flag(result.get("is_blacklisted")),
            is_mintable=_flag(result.get("is_mintable")),
            hidden_owner=_flag(result.get("hidden_owner")),
            can_take_back_ownership=_flag(result.get("can_take_back_ownership")),
            selfdestruct=_flag(result.get("selfdestruct")),
            is_proxy=_flag(result.get("is_proxy")),
            is_open_source=_flag(result.get("is_open_source")),
            buy_tax=_percent(result.get("buy_tax")),
            sell_tax=_percent(result.get("sell_tax")),
            owner_address=result.get("owner_address") or None,
            owner_percent=_percent(result.get("owner_percent")),
            creator_address=result.get("creator_address") or None,
            creator_percent=_percent(result.get("creator_percent")),
            holder_count=_as_int(result.get("holder_count")),
            lp_holder_count=_as_int(result.get("lp_holder_count")),
            liquidity_usd=_liquidity(result.get("dex")),
            pools=len(result.get("dex") or []),
            raw=result,
        )

    async def aclose(self) -> None:
        await self._http.aclose()


def _liquidity(raw: Any) -> float | None:
    """Total pool depth across every DEX GoPlus indexes for this token.

    Returns None when the field is absent — GoPlus did not look — and 0.0 when
    it looked and found nothing. Collapsing those would turn "we have no
    coverage here" into "this token has no market", which is a much stronger
    claim than the data supports.
    """
    if not isinstance(raw, list):
        return None

    total = 0.0
    for pool in raw:
        if not isinstance(pool, dict):
            continue
        try:
            total += float(pool.get("liquidity") or 0)
        except (TypeError, ValueError):
            continue
    return round(total, 2)


def _as_int(raw: Any) -> int | None:
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None
