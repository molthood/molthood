"""Robinhood Chain JSON-RPC client.

Talks to the public mainnet RPC (chain id 4663). Read-only by design: this
client never signs or broadcasts a transaction.
"""

from __future__ import annotations

from typing import Any, ClassVar

from app.core.exceptions import ServiceError
from app.models.enums import ServiceName
from app.services.base import BaseServiceClient
from app.services.http import TimeoutPolicy, validate_response
from app.services.models import RPCResponse


def hex_to_int(value: Any) -> int | None:
    """Parse a `0x`-prefixed quantity."""
    if not isinstance(value, str):
        return None
    try:
        return int(value, 16)
    except ValueError:
        return None


class RPCClient(BaseServiceClient):
    """Read-only JSON-RPC access to Robinhood Chain."""

    service: ClassVar[ServiceName] = ServiceName.ROBINHOOD_RPC
    operations: ClassVar[tuple[str, ...]] = (
        "get_chain_id",
        "get_block_number",
        "get_gas_price",
        "get_balance",
        "get_code",
        "get_transaction_count",
        "get_transaction",
        "call",
    )

    def __init__(self, *, base_url: str, **kwargs: Any) -> None:
        # RPC responses are small; a tight read budget keeps executions snappy.
        kwargs.setdefault(
            "timeout", TimeoutPolicy(connect_seconds=4.0, read_seconds=10.0)
        )
        super().__init__(base_url=base_url, **kwargs)
        self._request_id = 0

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    async def _call(self, method: str, params: list[Any] | None = None) -> Any:
        """Issue one JSON-RPC call and unwrap `result`, raising on `error`."""
        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": method,
            "params": params or [],
        }
        body = await self.http.post_json("", json_body=payload, operation=method)
        parsed = validate_response(
            body, RPCResponse, service=self.service.value, operation=method
        )

        if parsed.error is not None:
            raise ServiceError(
                f"RPC {method} failed: {parsed.error.message or 'unknown error'}",
                details={
                    "service": self.service.value,
                    "method": method,
                    "rpc_code": parsed.error.code,
                },
                suggested_action="Check the parameters. The node rejected this call.",
            )

        return parsed.result

    # --- chain ---

    async def ping(self) -> dict[str, Any]:
        chain_id = await self.get_chain_id()
        return {"service": self.service.value, "chain_id": chain_id, "ok": True}

    async def get_chain_id(self) -> int | None:
        return hex_to_int(await self._call("eth_chainId"))

    async def get_block_number(self) -> int | None:
        return hex_to_int(await self._call("eth_blockNumber"))

    async def get_gas_price(self) -> int | None:
        """Gas price in wei."""
        return hex_to_int(await self._call("eth_gasPrice"))

    # --- accounts ---

    async def get_balance(self, address: str, block: str = "latest") -> int | None:
        """Native balance in wei."""
        return hex_to_int(await self._call("eth_getBalance", [address, block]))

    async def get_code(self, address: str, block: str = "latest") -> str:
        """Deployed bytecode. `"0x"` means the address is an EOA, not a contract."""
        result = await self._call("eth_getCode", [address, block])
        return result if isinstance(result, str) else "0x"

    async def get_transaction_count(
        self, address: str, block: str = "latest"
    ) -> int | None:
        """Nonce — the number of transactions sent from this address."""
        return hex_to_int(await self._call("eth_getTransactionCount", [address, block]))

    async def is_contract(self, address: str) -> bool:
        code = await self.get_code(address)
        return len(code) > 2

    # --- transactions ---

    async def get_transaction(self, tx_hash: str) -> dict[str, Any] | None:
        result = await self._call("eth_getTransactionByHash", [tx_hash])
        return result if isinstance(result, dict) else None

    async def get_transaction_receipt(self, tx_hash: str) -> dict[str, Any] | None:
        """The outcome of a transaction: status, gas used, logs.

        Separate from the transaction itself, because the transaction says what
        was *asked for* and the receipt says what happened. A transfer that
        reverted looks identical to one that succeeded until you read this.
        """
        result = await self._call("eth_getTransactionReceipt", [tx_hash])
        return result if isinstance(result, dict) else None

    async def call(self, payload: dict[str, Any], block: str = "latest") -> Any:
        return await self._call("eth_call", [payload, block])
