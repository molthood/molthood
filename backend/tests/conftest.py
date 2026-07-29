"""Shared test fixtures.

The default suite never touches the network: services are replaced with fakes
so results are deterministic. Tests that do hit the live chain are marked
`live` and excluded unless explicitly selected.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.agents.registry import agent_registry
from app.config import get_settings
from app.main import create_app
from app.services.models import (
    AddressCounters,
    AddressInfo,
    ChainStats,
    ContractInfo,
    GasPrices,
    TokenCounters,
    TokenHolder,
    TokenHoldersResponse,
    TokenInfo,
    TokenListResponse,
)


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "live: hits the real Robinhood Chain APIs")

    # Point the suite at a throwaway database before anything builds an engine.
    # Without this the tests would truncate whatever `DATABASE_URL` names —
    # which, now that history is durable, is a developer's real one.
    os.environ["DATABASE_URL"] = "sqlite:///./test-molthood.db"
    os.environ["ANALYSIS_CACHE_SECONDS"] = "0"
    # The suite makes far more requests than a human would, and a limiter that
    # fired partway through would fail tests for a reason unrelated to what
    # they assert. The limiter has its own tests, which enable it explicitly.
    os.environ["RATE_LIMIT_ENABLED"] = "false"

    # Clear every provider credential. The provider tests assert that the
    # platform is fully functional with *zero* keys, and a suite that read the
    # developer's `.env` would pass or fail depending on whose machine it ran
    # on — the keyless case would stop being tested the moment anyone added a
    # key, which is exactly when it most needs guarding.
    for variable in (
        "EXA_API_KEY",
        "TAVILY_API_KEY",
        "JINA_API_KEY",
        "FIRECRAWL_API_KEY",
        "E2B_API_KEY",
        "UPSTASH_REDIS_REST_URL",
        "UPSTASH_REDIS_REST_TOKEN",
        "QSTASH_TOKEN",
        "QSTASH_CALLBACK_BASE_URL",
        "POSTHOG_API_KEY",
    ):
        os.environ[variable] = ""

    get_settings.cache_clear()


@pytest.fixture(scope="session")
def settings():
    return get_settings()


# --- Fakes ------------------------------------------------------------------


class FakeBlockscout:
    """Stands in for the explorer with fixed, realistic payloads."""

    service_name = "blockscout"

    def __init__(self) -> None:
        self.base_url = "https://explorer.test"
        self.is_configured = True
        self.calls: list[str] = []

    async def get_stats(self) -> ChainStats:
        self.calls.append("get_stats")
        return ChainStats(
            total_blocks="21000000",
            total_addresses="4500000",
            total_transactions="175000000",
            transactions_today="7000000",
            average_block_time=101.0,
            coin_price="1890.0",
            market_cap="227000000000",
            gas_prices=GasPrices(slow=0.06, average=0.09, fast=0.15),
        )

    async def get_token(self, address: str) -> TokenInfo:
        self.calls.append("get_token")
        return TokenInfo(
            address_hash=address,
            name="Test Token",
            symbol="TEST",
            decimals="18",
            type="ERC-20",
            total_supply="1000000000000000000000",
            holders_count="1500",
            exchange_rate="1.25",
            circulating_market_cap="1250000",
            volume_24h="98000",
            reputation="ok",
        )

    async def get_token_counters(self, address: str) -> TokenCounters:
        self.calls.append("get_token_counters")
        return TokenCounters(token_holders_count="1500", transfers_count="42000")

    async def get_token_holders(self, address: str) -> TokenHoldersResponse:
        self.calls.append("get_token_holders")
        return TokenHoldersResponse(
            items=[
                TokenHolder(
                    value="100000000000000000000",
                    address=AddressInfo(hash=f"0x{index:040x}"),
                )
                for index in range(3)
            ]
        )

    async def get_address(self, address: str) -> AddressInfo:
        self.calls.append("get_address")
        return AddressInfo(
            hash=address,
            coin_balance="1500000000000000000",
            is_contract=False,
            is_scam=False,
            exchange_rate="1890.0",
        )

    async def get_address_counters(self, address: str) -> AddressCounters:
        self.calls.append("get_address_counters")
        return AddressCounters(
            transactions_count="120",
            token_transfers_count="45",
            gas_usage_count="900000",
        )

    async def get_token_balances(self, address: str) -> list[Any]:
        self.calls.append("get_token_balances")
        return []

    async def get_contract(self, address: str) -> ContractInfo:
        self.calls.append("get_contract")
        return ContractInfo(
            name="TestContract",
            is_verified=True,
            compiler_version="v0.8.26",
            optimization_enabled=True,
            optimization_runs=200,
            license_type="mit",
            source_code="contract T { function f() public onlyOwner {} }",
        )

    async def list_tokens(self, *, limit: int = 20) -> TokenListResponse:
        self.calls.append("list_tokens")
        return TokenListResponse(
            items=[TokenInfo(address_hash="0x" + "1" * 40, symbol="AAA", name="Alpha")]
        )

    def explorer_url(self, kind: str, value: str) -> str:
        return f"{self.base_url}/{kind}/{value}"

    async def ping(self) -> dict[str, Any]:
        return {"ok": True}

    async def aclose(self) -> None:
        return None


class FakeRPC:
    service_name = "robinhood_rpc"

    def __init__(self, *, contract: bool = False) -> None:
        self.base_url = "https://rpc.test"
        self.is_configured = True
        self._contract = contract

    async def get_chain_id(self) -> int:
        return 4663

    async def get_block_number(self) -> int:
        return 21_000_123

    async def get_gas_price(self) -> int:
        return 36_766_000

    async def get_code(self, address: str, block: str = "latest") -> str:
        return "0x60806040" if self._contract else "0x"

    async def is_contract(self, address: str) -> bool:
        return self._contract

    async def get_transaction_count(self, address: str, block: str = "latest") -> int:
        return 77

    async def ping(self) -> dict[str, Any]:
        return {"ok": True}

    async def aclose(self) -> None:
        return None


class FakeUnconfigured:
    """A credentialed service with no key — the default local state."""

    def __init__(self, name: str, env: str) -> None:
        self.service_name = name
        self.api_key_env = env
        self.base_url = f"https://{name}.test"
        self.is_configured = False

    async def supports_network(self, network_id: int = 4663) -> bool:  # pragma: no cover
        raise AssertionError("must not be called when unconfigured")

    async def ping(self) -> dict[str, Any]:  # pragma: no cover
        raise AssertionError("must not be called when unconfigured")

    async def aclose(self) -> None:
        return None


class FakeServiceRegistry:
    """Registry of fakes, shaped like the real one."""

    def __init__(self, *, contract: bool = False) -> None:
        self.blockscout = FakeBlockscout()
        self.rpc = FakeRPC(contract=contract)
        self.codex = FakeUnconfigured("codex", "CODEX_API_KEY")
        self.openrouter = FakeUnconfigured("openrouter", "OPENROUTER_API_KEY")

    def list(self) -> list[Any]:
        return [self.rpc, self.blockscout, self.codex, self.openrouter]

    async def health(self) -> dict[str, dict[str, str]]:
        return {
            "robinhood_rpc": {"state": "live", "detail": "Responding."},
            "blockscout": {"state": "live", "detail": "Responding."},
            "codex": {"state": "not_configured", "detail": "No key."},
            "openrouter": {"state": "not_configured", "detail": "No key."},
        }

    async def aclose(self) -> None:
        return None


@pytest.fixture
def fake_services() -> FakeServiceRegistry:
    return FakeServiceRegistry()


@pytest.fixture
def fake_contract_services() -> FakeServiceRegistry:
    return FakeServiceRegistry(contract=True)


@pytest.fixture(autouse=True)
def _clean_execution_store() -> Iterator[None]:
    """Each test starts with an empty execution store.

    The store is now database-backed, so this truncates the table rather than
    clearing a deque. It also keeps the suite off any real database: the URL
    is forced to an in-memory SQLite file before the engine is built, so
    running the tests can never touch a developer's actual history.
    """
    from sqlalchemy import delete

    from app.core.database import create_schema, get_session_factory
    from app.models.auth import ApiKey
    from app.models.execution import Execution
    from app.models.watch import Watch

    create_schema()

    def truncate() -> None:
        with get_session_factory()() as session:
            session.execute(delete(Execution))
            session.execute(delete(Watch))
            # Self-serve keys carry the address that minted them, and the
            # signup cap counts per address. Left in place they accumulate
            # across the suite until an unrelated test trips the limit.
            # The session fixture's key is created with no ip and survives.
            session.execute(delete(ApiKey).where(ApiKey.created_ip.is_not(None)))
            session.commit()

    truncate()
    yield
    truncate()


@pytest.fixture(autouse=True)
def _offline_web_registry(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep GoPlus off the network during the default suite.

    The Market Agent reaches it through the web registry rather than the
    injected service registry, so the fakes do not cover it and unit tests
    were quietly making live calls — non-deterministic, and rate-limited.
    """
    from app.services.goplus import TokenSecurity
    from app.services.web.registry import get_web_registry

    async def offline(*args: object, **kwargs: object) -> TokenSecurity:
        return TokenSecurity(found=False)

    async def no_signatures(*args: object, **kwargs: object) -> list[Any]:
        return []

    registry = get_web_registry()
    monkeypatch.setattr(registry.goplus, "token_security", offline)
    # Reached the same way GoPlus is — through the web registry rather than the
    # injected fakes — so it needs stubbing for the same reason.
    monkeypatch.setattr(registry.signatures, "recover_abi", no_signatures)


@pytest.fixture(scope="session", autouse=True)
def _loaded_agents() -> None:
    agent_registry.autoload()


@pytest.fixture(scope="session")
def api_key() -> str:
    """A real key, minted against the test database.

    Not a stub: the suite exercises the same resolve-and-meter path a caller
    goes through, so an auth bug shows up here rather than in production.
    """
    from app.core.database import create_schema
    from app.repositories.api_keys import get_api_key_store

    create_schema()
    issued = get_api_key_store()._create(
        "pytest",
        # Far above what the suite spends, so a quota refusal in a test always
        # means the test meant to trigger one.
        quota=100_000,
        is_admin=True,
        ip=None,
    )
    return issued.secret


@pytest.fixture(scope="session")
def client(api_key: str) -> Iterator[TestClient]:
    """Authenticated by default, because almost every route now requires it."""
    with TestClient(create_app()) as test_client:
        test_client.headers["authorization"] = f"Bearer {api_key}"
        yield test_client


@pytest.fixture(scope="session")
def anonymous_client() -> Iterator[TestClient]:
    """No credential — for the tests that check auth is actually enforced."""
    with TestClient(create_app()) as test_client:
        yield test_client
