"""Blockscout explorer client for Robinhood Chain.

Wraps the public `/api/v2` surface. Every method returns a validated model, so
callers never handle raw upstream JSON.
"""

from __future__ import annotations

from typing import Any, ClassVar

from app.models.enums import ServiceName
from app.services.base import BaseServiceClient
from app.services.http import validate_response
from app.services.models import (
    AddressCounters,
    AddressInfo,
    ChainStats,
    ContractInfo,
    TokenBalance,
    TokenCounters,
    TokenHoldersResponse,
    TokenInfo,
    TokenListResponse,
    TransactionListResponse,
)


class BlockscoutClient(BaseServiceClient):
    """Explorer data: chain stats, addresses, tokens, contracts, transfers."""

    service: ClassVar[ServiceName] = ServiceName.BLOCKSCOUT
    operations: ClassVar[tuple[str, ...]] = (
        "get_stats",
        "get_address",
        "get_address_counters",
        "get_transactions",
        "get_token_balances",
        "get_token",
        "get_token_counters",
        "get_token_holders",
        "list_tokens",
        "get_contract",
    )

    async def ping(self) -> dict[str, Any]:
        stats = await self.get_stats()
        return {
            "service": self.service.value,
            "total_blocks": stats.total_blocks,
            "ok": True,
        }

    # --- chain ---

    async def get_stats(self) -> ChainStats:
        return await self.http.get_model(
            "/api/v2/stats", ChainStats, operation="get_stats"
        )

    # --- addresses / wallets ---

    async def get_address(self, address: str) -> AddressInfo:
        return await self.http.get_model(
            f"/api/v2/addresses/{address}", AddressInfo, operation="get_address"
        )

    async def get_address_counters(self, address: str) -> AddressCounters:
        return await self.http.get_model(
            f"/api/v2/addresses/{address}/counters",
            AddressCounters,
            operation="get_address_counters",
        )

    async def get_transactions(self, address: str) -> TransactionListResponse:
        return await self.http.get_model(
            f"/api/v2/addresses/{address}/transactions",
            TransactionListResponse,
            operation="get_transactions",
        )

    async def get_token_balances(self, address: str) -> list[TokenBalance]:
        # This endpoint returns a bare array rather than a paged envelope.
        payload = await self.http.get_json(
            f"/api/v2/addresses/{address}/token-balances",
            operation="get_token_balances",
        )
        if not isinstance(payload, list):
            return []
        return [
            validate_response(
                item, TokenBalance, service=self.service.value, operation="token_balance"
            )
            for item in payload
        ]

    # --- tokens ---

    async def get_token(self, address: str) -> TokenInfo:
        return await self.http.get_model(
            f"/api/v2/tokens/{address}", TokenInfo, operation="get_token"
        )

    async def get_token_counters(self, address: str) -> TokenCounters:
        return await self.http.get_model(
            f"/api/v2/tokens/{address}/counters",
            TokenCounters,
            operation="get_token_counters",
        )

    async def get_token_holders(self, address: str) -> TokenHoldersResponse:
        return await self.http.get_model(
            f"/api/v2/tokens/{address}/holders",
            TokenHoldersResponse,
            operation="get_token_holders",
        )

    async def list_tokens(self, *, limit: int = 20) -> TokenListResponse:
        response = await self.http.get_model(
            "/api/v2/tokens", TokenListResponse, operation="list_tokens"
        )
        response.items = response.items[:limit]
        return response

    # --- contracts ---

    async def get_contract(self, address: str) -> ContractInfo:
        return await self.http.get_model(
            f"/api/v2/smart-contracts/{address}",
            ContractInfo,
            operation="get_contract",
        )

    # --- links ---

    def explorer_url(self, kind: str, value: str) -> str:
        """Human-facing explorer link, used as an evidence source."""
        root = self.base_url
        paths = {
            "address": f"{root}/address/{value}",
            "token": f"{root}/token/{value}",
            "tx": f"{root}/tx/{value}",
            "block": f"{root}/block/{value}",
        }
        return paths.get(kind, root)
