"""Codex (formerly Defined.fi) market-data client.

GraphQL API providing token prices, pairs, and liquidity. Fully implemented
and key-ready.

Without `CODEX_API_KEY` every method raises `ConfigurationError`; the Market
Agent degrades to Blockscout rather than inventing prices.

Codex was verified on 2026-07-28 to index Robinhood Chain: network 4663 is one
of the 122 it lists, and USDe returned a live price. `supports_network` still
asks rather than assuming, because that can change.

Every query below was verified against the live schema. Introspection is
disabled on Codex's router, so a field name can only be confirmed by running
it — `volume24` was wrong and is really `volume`.
"""

from __future__ import annotations

from typing import Any, ClassVar

from app.core.exceptions import ServiceError
from app.models.enums import ServiceName
from app.services.base import BaseServiceClient

#: Robinhood Chain mainnet.
ROBINHOOD_NETWORK_ID = 4663


class CodexClient(BaseServiceClient):
    """Market data over Codex's GraphQL endpoint."""

    service: ClassVar[ServiceName] = ServiceName.CODEX
    api_key_env: ClassVar[str | None] = "CODEX_API_KEY"
    operations: ClassVar[tuple[str, ...]] = (
        "list_networks",
        "supports_network",
        "get_token_price",
        "get_token",
        "list_pairs",
        "top_tokens",
        "social_links",
    )

    #: Networks confirmed to be indexed, cached per process.
    _network_support: dict[int, bool]

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._network_support = {}

    def _auth_headers(self) -> dict[str, str]:
        # Codex authenticates with a bare `Authorization` value, not `Bearer`.
        if self._api_key is None:
            return {}
        return {
            "authorization": self._api_key.get_secret_value(),
            "content-type": "application/json",
        }

    async def _graphql(
        self, query: str, variables: dict[str, Any] | None = None, *, operation: str
    ) -> dict[str, Any]:
        self.ensure_configured()

        body = await self.http.post_json(
            "/graphql",
            json_body={"query": query, "variables": variables or {}},
            operation=operation,
        )

        if not isinstance(body, dict):
            raise ServiceError(
                "Codex returned an unexpected body.",
                details={"service": self.service.value, "operation": operation},
            )

        if body.get("errors"):
            first = body["errors"][0] if body["errors"] else {}
            raise ServiceError(
                f"Codex GraphQL error: {first.get('message', 'unknown')}",
                details={"service": self.service.value, "operation": operation},
                suggested_action="Check the query and that the API key has access.",
            )

        data = body.get("data")
        return data if isinstance(data, dict) else {}

    async def ping(self) -> dict[str, Any]:
        networks = await self.list_networks()
        return {"service": self.service.value, "networks": len(networks), "ok": True}

    async def list_networks(self) -> list[dict[str, Any]]:
        data = await self._graphql(
            "query { getNetworks { id name } }", operation="list_networks"
        )
        networks = data.get("getNetworks")
        return networks if isinstance(networks, list) else []

    async def supports_network(self, network_id: int = ROBINHOOD_NETWORK_ID) -> bool:
        """Ask Codex whether it indexes this chain, rather than assuming.

        Cached for the process lifetime. It listed all 122 networks on every
        single analysis — 240ms to answer a question whose answer changes
        approximately never.
        """
        if network_id in self._network_support:
            return self._network_support[network_id]

        networks = await self.list_networks()
        supported = any(network.get("id") == network_id for network in networks)

        # Only a positive answer is cached. A negative one may just mean the
        # request failed and returned nothing, and caching that would disable
        # market data for the rest of the process.
        if supported:
            self._network_support[network_id] = True

        return supported

    async def social_links(
        self, address: str, network_id: int = ROBINHOOD_NETWORK_ID
    ) -> dict[str, Any]:
        """The website and socials listed for this token on this chain.

        Note the wording. These are *per-chain listing* metadata, not verified
        statements by the project. Compared across chains, VIRTUAL reports
        `linktr.ee/virtualprotocol` and `twitter.com/virtuals_io` on Base,
        against `virtualsrh.lol` and a different Telegram on 4663 — so
        whoever listed the token here supplied these, and attributing them to
        Virtuals Protocol would name the wrong party.

        That difference is itself the more interesting signal: a token using a
        real project's name while listing entirely different links.

        These live on `token`, not on `token.info`; `TokenInfo` has no website
        field and querying one is a schema error.
        """
        query = """
        query Links($address: String!, $networkId: Int!) {
          token(input: { address: $address, networkId: $networkId }) {
            socialLinks { website twitter telegram discord }
          }
        }
        """
        data = await self._graphql(
            query, {"address": address, "networkId": network_id}, operation="social_links"
        )
        token = data.get("token")
        if not isinstance(token, dict):
            return {}
        links = token.get("socialLinks")
        return (
            {key: value for key, value in links.items() if value}
            if isinstance(links, dict)
            else {}
        )

    async def find_by_symbol(
        self, symbol: str, *, limit: int = 12
    ) -> list[dict[str, Any]]:
        """The same ticker wherever else Codex indexes it.

        Used to ask whether a token on this chain is reusing a name that
        already means something elsewhere — and, if so, whether it lists the
        same places as the original.
        """
        query = """
        query BySymbol($symbol: String!, $limit: Int) {
          filterTokens(
            phrase: $symbol
            rankings: { attribute: volume24, direction: DESC }
            limit: $limit
          ) {
            results {
              token { address symbol name networkId socialLinks { website twitter } }
              volume24
            }
          }
        }
        """
        data = await self._graphql(
            query, {"symbol": symbol, "limit": limit}, operation="find_by_symbol"
        )
        container = data.get("filterTokens")
        if isinstance(container, dict):
            results = container.get("results")
            if isinstance(results, list):
                return results
        return []

    async def get_token(
        self, address: str, network_id: int = ROBINHOOD_NETWORK_ID
    ) -> dict[str, Any] | None:
        query = """
        query GetToken($address: String!, $networkId: Int!) {
          token(input: { address: $address, networkId: $networkId }) {
            address name symbol decimals totalSupply
            info { circulatingSupply imageThumbUrl }
          }
        }
        """
        data = await self._graphql(
            query,
            {"address": address, "networkId": network_id},
            operation="get_token",
        )
        token = data.get("token")
        return token if isinstance(token, dict) else None

    async def get_token_price(
        self, address: str, network_id: int = ROBINHOOD_NETWORK_ID
    ) -> dict[str, Any] | None:
        query = """
        query GetPrice($inputs: [GetPriceInput!]!) {
          getTokenPrices(inputs: $inputs) {
            address networkId priceUsd confidence timestamp
          }
        }
        """
        data = await self._graphql(
            query,
            {"inputs": [{"address": address, "networkId": network_id}]},
            operation="get_token_price",
        )
        prices = data.get("getTokenPrices")
        if isinstance(prices, list) and prices:
            first = prices[0]
            return first if isinstance(first, dict) else None
        return None

    async def list_pairs(
        self, address: str, network_id: int = ROBINHOOD_NETWORK_ID, *, limit: int = 10
    ) -> list[dict[str, Any]]:
        query = """
        query ListPairs($address: String!, $networkId: Int!, $limit: Int) {
          listPairsWithMetadataForToken(
            tokenAddress: $address, networkId: $networkId, limit: $limit
          ) {
            results {
              pair { address token0 token1 }
              backingToken { address symbol name }
              liquidity
              volume
            }
          }
        }
        """
        data = await self._graphql(
            query,
            {"address": address, "networkId": network_id, "limit": limit},
            operation="list_pairs",
        )
        container = data.get("listPairsWithMetadataForToken")
        if isinstance(container, dict):
            results = container.get("results")
            if isinstance(results, list):
                return results
        return []

    async def top_tokens(
        self, network_id: int = ROBINHOOD_NETWORK_ID, *, limit: int = 20
    ) -> list[dict[str, Any]]:
        """The chain's most liquid tokens, ranked by 24h volume.

        This is the only chain-wide market view available. The explorer can
        list tokens but carries no price, so without this the Console has no
        honest source for a market table at all.
        """
        query = """
        query TopTokens($networkId: Int!, $limit: Int) {
          filterTokens(
            filters: { network: [$networkId] }
            rankings: { attribute: volume24, direction: DESC }
            limit: $limit
          ) {
            count
            results {
              token { address name symbol decimals }
              priceUSD
              liquidity
              volume24
              change24
              marketCap
            }
          }
        }
        """
        data = await self._graphql(
            query, {"networkId": network_id, "limit": limit}, operation="top_tokens"
        )
        container = data.get("filterTokens")
        if isinstance(container, dict):
            results = container.get("results")
            if isinstance(results, list):
                return results
        return []
