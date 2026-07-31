"""`/api/v1/chain` — lean live chain data for dashboards.

Distinct from `/api/v1/project`: that runs a full analysis through the engine,
this returns raw figures for stat tiles. Both go through the service layer;
neither talks to an upstream host directly from the route.
"""

from __future__ import annotations

import asyncio
import re
from typing import Any

from fastapi import APIRouter, Query

from app.api.deps import ExecutionStoreDep, ServiceRegistryDep, SettingsDep
from app.core.exceptions import ValidationError
from app.services.models import to_float, to_int
from app.services.rpc import hex_to_int

router = APIRouter(tags=["chain"])


@router.get(
    "/stats",
    summary="Live chain statistics",
    description="Explorer and RPC figures for Robinhood Chain, fetched in parallel.",
)
async def chain_stats(
    services: ServiceRegistryDep,
    settings: SettingsDep,
    store: ExecutionStoreDep,
) -> dict[str, Any]:
    import asyncio

    stats, head_block, gas_price = await asyncio.gather(
        services.blockscout.get_stats(),
        services.rpc.get_block_number(),
        services.rpc.get_gas_price(),
        return_exceptions=True,
    )

    payload: dict[str, Any] = {
        "chain": {"id": settings.chain_id, "name": settings.chain_name},
        "explorer_url": services.blockscout.base_url,
    }

    if isinstance(stats, BaseException):
        raise stats

    payload["network"] = {
        "total_blocks": to_int(stats.total_blocks),
        "total_addresses": to_int(stats.total_addresses),
        "total_transactions": to_int(stats.total_transactions),
        "transactions_today": to_int(stats.transactions_today),
        "average_block_time_ms": stats.average_block_time,
        "network_utilization_pct": stats.network_utilization_percentage,
        "gas_used_today": to_int(stats.gas_used_today),
        "head_block": None if isinstance(head_block, BaseException) else head_block,
        "gas_price_wei": None if isinstance(gas_price, BaseException) else gas_price,
        "gas_prices_gwei": stats.gas_prices.model_dump() if stats.gas_prices else None,
    }
    payload["market"] = {
        "coin_price_usd": to_float(stats.coin_price),
        "market_cap_usd": to_float(stats.market_cap),
        "tvl_usd": to_float(stats.tvl),
    }
    payload["executions"] = store.stats()

    return payload


@router.get(
    "/tokens",
    summary="Tracked tokens on the chain",
    description=(
        "Pass `q` to search by ticker or name. People see a ticker on social "
        "media, not a 42-character address, so this is how a subject is found "
        "before it can be analysed."
    ),
)
async def chain_tokens(
    services: ServiceRegistryDep,
    limit: int = 12,
    q: str | None = Query(
        default=None,
        max_length=64,
        description="Match against ticker and name, case-insensitively.",
    ),
) -> dict[str, Any]:
    # Search widens the fetch before narrowing it: the explorer returns tokens
    # ranked by activity, so a ticker outside the top handful would otherwise
    # be unfindable no matter how exactly it was typed.
    fetch = 50 if q else min(limit, 50)
    tokens = await services.blockscout.list_tokens(limit=fetch)

    items = [
        {
            "address": token.address_hash,
            "name": token.name,
            "symbol": token.symbol,
            "type": token.type,
            "holders": to_int(token.holders_count),
            "price_usd": to_float(token.exchange_rate),
            "market_cap_usd": to_float(token.circulating_market_cap),
            "volume_24h_usd": to_float(token.volume_24h),
            "icon_url": token.icon_url,
        }
        for token in tokens.items
    ]

    if q:
        items = _matching(items, q)[:limit]

    return {"items": items, "total": len(items)}


def _matching(items: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
    """Rank by how well each token matches, best first.

    An exact ticker beats a prefix, which beats a substring. Someone typing
    "APE" means APE, not "GRAPEFRUIT" — and putting the exact hit anywhere but
    first would send them to analyse the wrong token.
    """
    needle = query.strip().lower()
    if not needle:
        return items

    ranked: list[tuple[int, dict[str, Any]]] = []
    for item in items:
        symbol = (item.get("symbol") or "").lower()
        name = (item.get("name") or "").lower()

        if symbol == needle:
            rank = 0
        elif symbol.startswith(needle):
            rank = 1
        elif needle in symbol:
            rank = 2
        elif name.startswith(needle):
            rank = 3
        elif needle in name:
            rank = 4
        else:
            continue

        ranked.append((rank, item))

    ranked.sort(key=lambda pair: pair[0])
    return [item for _, item in ranked]


_TX_HASH = re.compile(r"^0x[0-9a-fA-F]{64}$")


@router.get(
    "/transaction/{tx_hash}",
    summary="One transaction, with its outcome",
    description=(
        "The transaction and its receipt together. The transaction says what "
        "was asked for; the receipt says what happened — a call that reverted "
        "is indistinguishable from one that succeeded without it."
    ),
)
async def chain_transaction(services: ServiceRegistryDep, tx_hash: str) -> dict[str, Any]:
    if not _TX_HASH.match(tx_hash):
        raise ValidationError(
            "A transaction hash is 0x followed by 64 hex characters.",
            suggested_action="Check the hash and try again.",
        )

    transaction, receipt = await asyncio.gather(
        services.rpc.get_transaction(tx_hash),
        services.rpc.get_transaction_receipt(tx_hash),
    )

    if transaction is None:
        # Not found is a real answer — the hash may be from another chain, or
        # the transaction may not be mined yet. Both are worth distinguishing
        # from a node that failed to respond.
        return {"found": False, "hash": tx_hash}

    status = None
    if receipt is not None:
        raw = receipt.get("status")
        if isinstance(raw, str):
            status = "success" if hex_to_int(raw) == 1 else "reverted"

    return {
        "found": True,
        "hash": tx_hash,
        "status": status,
        "block_number": hex_to_int(transaction.get("blockNumber")),
        "from": transaction.get("from"),
        "to": transaction.get("to"),
        # A `to` of null means the transaction deployed a contract rather than
        # calling one, which changes what the whole thing was.
        "creates_contract": transaction.get("to") is None,
        "value_wei": hex_to_int(transaction.get("value")),
        "gas_limit": hex_to_int(transaction.get("gas")),
        "gas_used": hex_to_int(receipt.get("gasUsed")) if receipt else None,
        "gas_price_wei": hex_to_int(transaction.get("gasPrice")),
        "nonce": hex_to_int(transaction.get("nonce")),
        "input_size_bytes": max(len(str(transaction.get("input") or "0x")) - 2, 0) // 2,
        "log_count": len(receipt.get("logs") or []) if receipt else None,
    }
