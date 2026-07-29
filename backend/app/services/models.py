"""Validation models for external service payloads.

Every field is optional and every model tolerates unknown keys: upstream
explorers add and rename fields without notice, and a cosmetic change must not
take an analysis down. What we *do* enforce is the type of anything we read.

Numeric fields arrive as decimal strings from Blockscout; the helpers below
convert them at the edge so nothing downstream has to guess.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ExternalModel(BaseModel):
    """Base for upstream payloads — lenient about extra keys by design."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


def to_int(value: Any) -> int | None:
    """Parse an upstream numeric string, tolerating nulls and junk."""
    if value is None:
        return None
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def from_wei(value: Any, decimals: int = 18) -> float | None:
    """Convert a base-unit integer string into a human decimal amount."""
    raw = to_int(value)
    if raw is None:
        return None
    # 10.0 rather than 10: `int ** int` widens to Any under strict typing.
    return raw / (10.0**decimals)


# --- Blockscout -------------------------------------------------------------


class GasPrices(ExternalModel):
    slow: float | None = None
    average: float | None = None
    fast: float | None = None


class ChainStats(ExternalModel):
    """`GET /api/v2/stats`."""

    total_blocks: str | None = None
    total_addresses: str | None = None
    total_transactions: str | None = None
    transactions_today: str | None = None
    average_block_time: float | None = None
    coin_price: str | None = None
    market_cap: str | None = None
    gas_prices: GasPrices | None = None
    gas_used_today: str | None = None
    network_utilization_percentage: float | None = None
    tvl: str | None = None


class AddressTag(ExternalModel):
    label: str | None = None


class AddressInfo(ExternalModel):
    """`GET /api/v2/addresses/{hash}`."""

    hash: str | None = None
    coin_balance: str | None = None
    is_contract: bool | None = None
    is_verified: bool | None = None
    is_scam: bool | None = None
    name: str | None = None
    proxy_type: str | None = None
    ens_domain_name: str | None = None
    exchange_rate: str | None = None
    has_tokens: bool | None = None
    has_token_transfers: bool | None = None
    creation_transaction_hash: str | None = None
    creator_address_hash: str | None = None
    public_tags: list[AddressTag] = Field(default_factory=list)


class AddressCounters(ExternalModel):
    """`GET /api/v2/addresses/{hash}/counters`."""

    transactions_count: str | None = None
    token_transfers_count: str | None = None
    gas_usage_count: str | None = None
    validations_count: str | None = None


class TokenInfo(ExternalModel):
    """`GET /api/v2/tokens/{hash}` and items of `GET /api/v2/tokens`."""

    address_hash: str | None = None
    name: str | None = None
    symbol: str | None = None
    decimals: str | None = None
    type: str | None = None
    total_supply: str | None = None
    holders_count: str | None = None
    exchange_rate: str | None = None
    circulating_market_cap: str | None = None
    volume_24h: str | None = None
    icon_url: str | None = None
    reputation: str | None = None


class TokenCounters(ExternalModel):
    """`GET /api/v2/tokens/{hash}/counters`."""

    token_holders_count: str | None = None
    transfers_count: str | None = None


class TokenListResponse(ExternalModel):
    items: list[TokenInfo] = Field(default_factory=list)


class TokenHolder(ExternalModel):
    value: str | None = None
    address: AddressInfo | None = None


class TokenHoldersResponse(ExternalModel):
    items: list[TokenHolder] = Field(default_factory=list)


class TokenBalance(ExternalModel):
    value: str | None = None
    token: TokenInfo | None = None


class ContractInfo(ExternalModel):
    """`GET /api/v2/smart-contracts/{hash}`."""

    name: str | None = None
    is_verified: bool | None = None
    compiler_version: str | None = None
    optimization_enabled: bool | None = None
    optimization_runs: int | None = None
    license_type: str | None = None
    verified_at: datetime | None = None
    proxy_type: str | None = None
    source_code: str | None = None
    deployed_bytecode: str | None = None
    external_libraries: list[dict[str, Any]] = Field(default_factory=list)

    #: "Verified" is not one thing. A partial match means the explorer could
    #: not reproduce the deployed bytecode exactly from this source, so the
    #: source is indicative rather than proof — a distinction the explorer's
    #: own green tick hides. Both USDe and VIRTUAL are partial-only.
    is_fully_verified: bool | None = None
    is_partially_verified: bool | None = None
    #: Set when the bytecode changed after verification. A published source
    #: that no longer matches what is deployed is worse than none.
    is_changed_bytecode: bool | None = None
    certified: bool | None = None

    #: The interface. Scanned for privileged functions; for a proxy this is
    #: nearly empty and the implementation's ABI is the one that matters.
    abi: list[dict[str, Any]] = Field(default_factory=list)
    implementations: list[dict[str, Any]] = Field(default_factory=list)


class TransactionInfo(ExternalModel):
    hash: str | None = None
    status: str | None = None
    result: str | None = None
    value: str | None = None
    gas_used: str | None = None
    timestamp: datetime | None = None
    method: str | None = None
    from_: AddressInfo | None = Field(default=None, alias="from")
    to: AddressInfo | None = None


class TransactionListResponse(ExternalModel):
    items: list[TransactionInfo] = Field(default_factory=list)


class BlockInfo(ExternalModel):
    height: int | None = None
    hash: str | None = None
    timestamp: datetime | None = None
    transactions_count: int | None = None
    gas_used: str | None = None
    gas_limit: str | None = None


# --- JSON-RPC ---------------------------------------------------------------


class RPCError(ExternalModel):
    code: int | None = None
    message: str | None = None


class RPCResponse(ExternalModel):
    jsonrpc: str | None = None
    id: int | str | None = None
    result: Any = None
    error: RPCError | None = None


# --- OpenRouter -------------------------------------------------------------


class ChatMessage(ExternalModel):
    role: str | None = None
    content: str | None = None


class ChatChoice(ExternalModel):
    index: int | None = None
    message: ChatMessage | None = None
    finish_reason: str | None = None


class ChatUsage(ExternalModel):
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None


class ChatCompletionResponse(ExternalModel):
    id: str | None = None
    model: str | None = None
    choices: list[ChatChoice] = Field(default_factory=list)
    usage: ChatUsage | None = None

    @property
    def text(self) -> str:
        if not self.choices:
            return ""
        message = self.choices[0].message
        return (message.content or "").strip() if message else ""
