"""Project Agent — chain overview and wallet analysis."""

from __future__ import annotations

import asyncio
from typing import Any, ClassVar, Final

from app.agents.base import AgentMetadata, BaseAgent
from app.config import get_settings
from app.engine.context import ExecutionContext
from app.engine.result import AgentResult, Finding
from app.engine.task import Task
from app.logging import get_logger
from app.models.enums import AgentKind
from app.services.models import from_wei, to_float, to_int

logger = get_logger(__name__)

REQUIRED_SERVICES: Final[tuple[str, ...]] = ("blockscout", "robinhood_rpc")


class ProjectAgent(BaseAgent):
    """Handles chain-level overviews and wallet analysis.

    Two targets share one agent because both answer "what is the state of this
    subject" from the same explorer and RPC reads.
    """

    metadata: ClassVar[AgentMetadata] = AgentMetadata(
        kind=AgentKind.PROJECT,
        name="Project Agent",
        description=(
            "Turns a single brief into a scoped plan, assigns work to other "
            "agents, and tracks it to completion."
        ),
        version="0.4.0",
        capabilities=("task_decomposition", "agent_routing", "progress_tracking"),
    )

    implemented: ClassVar[bool] = True

    async def run(self, task: Task, context: ExecutionContext) -> AgentResult:
        address = context.routing.address if context.routing else None

        if address is None:
            return await self._chain_overview(context)
        return await self._wallet_analysis(address, context)

    async def _chain_overview(self, context: ExecutionContext) -> AgentResult:
        """Network-level snapshot: stats, head block, gas, notable tokens."""
        blockscout = context.services.blockscout
        rpc = context.services.rpc

        stats, block_number, gas_price, tokens = await asyncio.gather(
            blockscout.get_stats(),
            rpc.get_block_number(),
            rpc.get_gas_price(),
            blockscout.list_tokens(limit=10),
            return_exceptions=True,
        )
        context.note_service("blockscout")
        context.note_service("robinhood_rpc")

        if isinstance(stats, BaseException):
            raise stats

        settings = get_settings()
        facts: dict[str, Any] = {
            "chain_name": settings.chain_name,
            "chain_id": settings.chain_id,
            "total_blocks": to_int(stats.total_blocks),
            "total_addresses": to_int(stats.total_addresses),
            "total_transactions": to_int(stats.total_transactions),
            "transactions_today": to_int(stats.transactions_today),
            "average_block_time_ms": stats.average_block_time,
            "coin_price_usd": to_float(stats.coin_price),
            "market_cap_usd": to_float(stats.market_cap),
            "network_utilization_pct": stats.network_utilization_percentage,
            "gas_prices_gwei": (
                stats.gas_prices.model_dump() if stats.gas_prices else None
            ),
        }

        if not isinstance(block_number, BaseException):
            facts["head_block"] = block_number
        if not isinstance(gas_price, BaseException):
            facts["gas_price_wei"] = gas_price

        top_tokens: list[dict[str, Any]] = []
        if not isinstance(tokens, BaseException):
            for token in tokens.items:
                top_tokens.append(
                    {
                        "address": token.address_hash,
                        "name": token.name,
                        "symbol": token.symbol,
                        "holders": to_int(token.holders_count),
                        "market_cap_usd": to_float(token.circulating_market_cap),
                        "volume_24h_usd": to_float(token.volume_24h),
                    }
                )
        facts["top_tokens"] = top_tokens

        context.facts["chain"] = facts

        context.add_source("Blockscout explorer", blockscout.base_url)
        context.add_source("Blockscout stats API", f"{blockscout.base_url}/api/v2/stats")
        context.add_source(f"{settings.chain_name} RPC", rpc.base_url)

        explorer = blockscout.base_url
        evidence: list[Finding] = [
            Finding.confirmed(
                "chain",
                "Chain",
                f"{settings.chain_name} (id {settings.chain_id})",
                explorer,
            ),
            Finding.confirmed("blocks", "Total blocks", facts["total_blocks"], explorer),
            Finding.confirmed(
                "addresses", "Total addresses", facts["total_addresses"], explorer
            ),
            Finding.confirmed(
                "transactions",
                "Total transactions",
                facts["total_transactions"],
                explorer,
            ),
            Finding.confirmed(
                "throughput", "Transactions today", facts["transactions_today"], explorer
            ),
            Finding.confirmed(
                "block_time",
                "Average block time (ms)",
                facts["average_block_time_ms"],
                explorer,
            ),
            Finding.confirmed(
                "gas", "Gas prices (gwei)", facts["gas_prices_gwei"], explorer
            ),
            Finding.confirmed(
                "tokens", "Tracked tokens sampled", len(top_tokens), explorer
            ),
        ]

        # The head block is the one figure here read from the node rather than
        # the explorer, so it is also the one that can go missing on its own.
        if facts.get("head_block") is not None:
            evidence.append(
                Finding.confirmed(
                    "head", "Head block (RPC)", facts["head_block"], rpc.base_url
                )
            )
        else:
            evidence.append(
                Finding.unknown(
                    "head",
                    "Head block (RPC)",
                    reason="The RPC node did not return a block height.",
                    source_url=rpc.base_url,
                )
            )

        return AgentResult.ok(
            summary=f"Collected a chain-level overview of {settings.chain_name}.",
            output={"chain": facts},
            evidence=evidence,
        )

    async def _wallet_analysis(
        self, address: str, context: ExecutionContext
    ) -> AgentResult:
        """Balances, activity counters, and token holdings for one address."""
        settings = get_settings()
        blockscout = context.services.blockscout
        rpc = context.services.rpc

        info, counters, balances, nonce = await asyncio.gather(
            blockscout.get_address(address),
            blockscout.get_address_counters(address),
            blockscout.get_token_balances(address),
            rpc.get_transaction_count(address),
            return_exceptions=True,
        )
        context.note_service("blockscout")
        context.note_service("robinhood_rpc")

        if isinstance(info, BaseException):
            raise info

        facts: dict[str, Any] = {
            "address": address,
            "native_balance": from_wei(info.coin_balance),
            "is_contract": info.is_contract,
            "is_scam_flagged": info.is_scam,
            "explorer_name": info.name,
            "ens_domain": info.ens_domain_name,
            "has_tokens": info.has_tokens,
            "public_tags": [tag.label for tag in info.public_tags if tag.label],
        }

        native = facts["native_balance"]
        rate = to_float(info.exchange_rate)
        if native is not None and rate is not None:
            facts["native_balance_usd"] = round(native * rate, 2)

        if not isinstance(counters, BaseException):
            facts["transactions_count"] = to_int(counters.transactions_count)
            facts["token_transfers_count"] = to_int(counters.token_transfers_count)
            facts["gas_usage_count"] = to_int(counters.gas_usage_count)

        if not isinstance(nonce, BaseException):
            facts["nonce"] = nonce

        holdings: list[dict[str, Any]] = []
        if not isinstance(balances, BaseException):
            for entry in balances[:50]:
                token = entry.token
                if token is None:
                    continue
                decimals = to_int(token.decimals) or 18
                raw = to_int(entry.value)
                amount = (raw / 10**decimals) if raw is not None else None
                rate = to_float(token.exchange_rate)
                holdings.append(
                    {
                        "symbol": token.symbol,
                        "name": token.name,
                        "address": token.address_hash,
                        "amount": amount,
                        # Carried so the Portfolio Agent can screen the largest
                        # positions first. Often absent — most tokens on this
                        # chain have no quoted rate — which is why selection
                        # falls back to explorer order rather than dropping the
                        # unpriced ones.
                        "value_usd": (
                            round(amount * rate, 2)
                            if amount is not None and rate is not None
                            else None
                        ),
                    }
                )
        facts["token_holdings_count"] = len(holdings)

        context.facts["wallet"] = facts
        context.facts["holdings"] = holdings

        explorer = blockscout.explorer_url("address", address)
        context.add_source("Blockscout address page", explorer)
        context.add_source(
            "Blockscout address API",
            f"{blockscout.base_url}/api/v2/addresses/{address}",
        )
        context.add_source(f"{settings.chain_name} RPC", rpc.base_url)

        evidence: list[Finding] = [
            Finding.confirmed(
                "balance", "Native balance", facts["native_balance"], explorer
            ),
            Finding.confirmed(
                "balance_usd",
                "Native balance (USD)",
                facts.get("native_balance_usd"),
                explorer,
            ),
            Finding.confirmed(
                "activity", "Transaction count", facts.get("transactions_count"), explorer
            ),
            Finding.confirmed(
                "transfers",
                "Token transfer count",
                facts.get("token_transfers_count"),
                explorer,
            ),
            Finding.confirmed("nonce", "Nonce (RPC)", facts.get("nonce"), rpc.base_url),
            Finding.confirmed(
                "holdings", "Distinct token holdings", len(holdings), explorer
            ),
            Finding.confirmed(
                "is_contract", "Is a contract", facts["is_contract"], explorer
            ),
        ]
        if facts["public_tags"]:
            evidence.append(
                Finding.confirmed(
                    "tags", "Explorer tags", ", ".join(facts["public_tags"]), explorer
                )
            )

        return AgentResult.ok(
            summary=f"Collected wallet data for {address}.",
            output={"wallet": facts},
            evidence=evidence,
        )


AGENT = ProjectAgent
