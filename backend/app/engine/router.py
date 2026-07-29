"""Execution router.

Decides *what* a request is asking about and *which* agent should handle it.
Routing lives here so no workflow is ever hardcoded in a route handler.

When free-form text carries an address but no explicit noun, the router asks
the chain what that address actually is instead of guessing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from app.core.exceptions import UnresolvableHostError, UnroutableRequestError
from app.engine.context import ExecutionRequest
from app.logging import get_logger
from app.models.enums import AgentKind, ServiceName
from app.services.registry import ServiceRegistry
from app.services.web.fetcher import normalize_url, validate_public_url_async
from app.utils.validation import extract_address, extract_url, validate_address

logger = get_logger(__name__)


class AnalysisTarget(StrEnum):
    TOKEN = "token"
    WALLET = "wallet"
    CONTRACT = "contract"
    PROJECT = "project"
    #: Off-chain: a website or domain rather than an on-chain subject.
    SITE = "site"


@dataclass(frozen=True, slots=True)
class RoutingDecision:
    """The plan the engine executes."""

    target: AnalysisTarget
    address: str | None
    primary_agent: AgentKind
    #: Agents run after the primary one, reading the evidence it gathered.
    follow_up_agents: tuple[AgentKind, ...] = ()
    services: tuple[ServiceName, ...] = ()
    reason: str = ""

    @property
    def agents(self) -> tuple[AgentKind, ...]:
        return (self.primary_agent, *self.follow_up_agents)


#: Keyword → target. Checked before any chain probe, so an explicit noun wins.
_KEYWORDS: dict[AnalysisTarget, tuple[str, ...]] = {
    AnalysisTarget.TOKEN: ("token", "coin", "market", "price", "liquidity", "supply"),
    AnalysisTarget.CONTRACT: ("contract", "audit", "source", "bytecode", "abi", "verify"),
    AnalysisTarget.WALLET: ("wallet", "address", "holder", "portfolio", "balance"),
    AnalysisTarget.SITE: ("site", "website", "domain", "homepage", "web", "url"),
    AnalysisTarget.PROJECT: ("project", "chain", "network", "overview", "ecosystem"),
}

_PRIMARY_AGENT: dict[AnalysisTarget, AgentKind] = {
    AnalysisTarget.TOKEN: AgentKind.MARKET,
    AnalysisTarget.CONTRACT: AgentKind.CONTRACT,
    AnalysisTarget.WALLET: AgentKind.PROJECT,
    AnalysisTarget.PROJECT: AgentKind.PROJECT,
    AnalysisTarget.SITE: AgentKind.SITE,
}

_SERVICES: dict[AnalysisTarget, tuple[ServiceName, ...]] = {
    AnalysisTarget.TOKEN: (
        ServiceName.BLOCKSCOUT,
        ServiceName.ROBINHOOD_RPC,
        ServiceName.CODEX,
    ),
    AnalysisTarget.CONTRACT: (ServiceName.BLOCKSCOUT, ServiceName.ROBINHOOD_RPC),
    AnalysisTarget.WALLET: (ServiceName.BLOCKSCOUT, ServiceName.ROBINHOOD_RPC),
    AnalysisTarget.PROJECT: (ServiceName.BLOCKSCOUT, ServiceName.ROBINHOOD_RPC),
    #: Web intelligence uses its own registry, outside ServiceName.
    AnalysisTarget.SITE: (),
}


@dataclass(slots=True)
class ExecutionRouter:
    """Turns a request into a routing decision."""

    services: ServiceRegistry
    _cache: dict[str, AnalysisTarget] = field(default_factory=dict)

    async def route(self, request: ExecutionRequest) -> RoutingDecision:
        text = request.request.lower()

        # 1. An explicit target on the request always wins.
        explicit = request.metadata.get("target")
        if isinstance(explicit, str) and explicit in AnalysisTarget.__members__.values():
            target = AnalysisTarget(explicit)
            address = self._address_for(request, target)
            if target is AnalysisTarget.SITE:
                # An explicit target must not be a way around the SSRF guard:
                # this path is reachable from `engine.analyze(target="site")`.
                return await self._decide_site(address or "", "explicit target")
            return self._decide(target, address, "explicit target on request")

        address = extract_address(request.request)
        url = extract_url(request.request)

        # 2. A keyword in the text disambiguates without touching the network.
        keyword_target = self._match_keyword(text)

        if keyword_target is not None:
            if keyword_target is AnalysisTarget.SITE:
                if url is None:
                    raise UnroutableRequestError(
                        "A site analysis needs a URL or domain.",
                        details={"target": "site"},
                    )
                return await self._decide_site(url, "keyword match")

            if keyword_target is not AnalysisTarget.PROJECT and address is None:
                raise UnroutableRequestError(
                    f"A {keyword_target.value} analysis needs an address.",
                    details={"target": keyword_target.value},
                )
            return self._decide(keyword_target, address, "keyword match")

        # 3. An address with no noun: ask the chain what it is.
        if address is not None:
            target = await self._classify_address(address)
            return self._decide(target, address, "chain probe")

        # 4. A URL with no address is unambiguously an off-chain subject.
        if url is not None:
            return await self._decide_site(url, "url detected")

        # 4. No address and no keyword — a chain-level overview is the only
        #    thing we can answer without inventing a subject.
        if any(word in text for word in ("robinhood", "molthood", "everything")):
            return self._decide(AnalysisTarget.PROJECT, None, "chain-level fallback")

        raise UnroutableRequestError(
            "Could not determine what to analyse from this request.",
            details={"request": request.request[:120]},
        )

    def _match_keyword(self, text: str) -> AnalysisTarget | None:
        for target, words in _KEYWORDS.items():
            if any(word in text for word in words):
                return target
        return None

    def _address_for(
        self, request: ExecutionRequest, target: AnalysisTarget
    ) -> str | None:
        raw = request.metadata.get("address")

        # A site's "address" is a URL, not a 0x address. It is returned raw
        # here and validated by the caller through `_decide_site`.
        if target is AnalysisTarget.SITE:
            if isinstance(raw, str) and raw:
                return raw
            url = extract_url(request.request)
            if url is None:
                raise UnroutableRequestError(
                    "A site analysis needs a URL or domain.",
                    details={"target": "site"},
                )
            return url

        if isinstance(raw, str) and raw:
            return validate_address(raw)

        address = extract_address(request.request)
        if address is None and target is not AnalysisTarget.PROJECT:
            raise UnroutableRequestError(
                f"A {target.value} analysis needs an address.",
                details={"target": target.value},
            )
        return address

    async def _classify_address(self, address: str) -> AnalysisTarget:
        """Ask the chain whether an address is a token, a contract, or a wallet."""
        if address in self._cache:
            return self._cache[address]

        target = AnalysisTarget.WALLET

        try:
            if await self.services.rpc.is_contract(address):
                # A contract that the explorer knows as a token is a token;
                # otherwise it is a plain contract.
                try:
                    token = await self.services.blockscout.get_token(address)
                    target = (
                        AnalysisTarget.TOKEN if token.symbol else AnalysisTarget.CONTRACT
                    )
                except Exception:
                    target = AnalysisTarget.CONTRACT
        except Exception as exc:
            logger.warning("address_classification_failed", error=str(exc))

        self._cache[address] = target
        logger.info("address_classified", address=address, target=target.value)
        return target

    async def _decide_site(self, url: str, reason: str) -> RoutingDecision:
        """Validate the URL while routing.

        A private or malformed host fails here as a 422 with an actionable
        message, rather than reaching an agent and surfacing as a generic "no
        agent produced data" failure.

        A domain that simply does not resolve is deliberately allowed through.
        That is a fact about the subject, not a bad request, and the Site Agent
        reports it — along with the registration and archive history a dead
        domain still has.
        """
        try:
            validated = await validate_public_url_async(url)
        except UnresolvableHostError:
            validated = normalize_url(url)

        return self._decide(AnalysisTarget.SITE, validated, reason)

    def _decide(
        self, target: AnalysisTarget, address: str | None, reason: str
    ) -> RoutingDecision:
        # Risk review runs on everything with a concrete on-chain subject.
        # Excluded for SITE: the Risk Agent scores on-chain evidence, and
        # reporting "100/100" for a website it never examined would mislead.
        on_chain_subject = target not in (AnalysisTarget.PROJECT, AnalysisTarget.SITE)

        follow_up: tuple[AgentKind, ...] = (AgentKind.RISK,) if on_chain_subject else ()

        # A wallet is the only subject that owns other subjects. Screening what
        # it holds runs *before* risk, because the worst position is an input to
        # the wallet's own score — a spotless address holding an unsellable
        # token is not a low-risk wallet.
        if target is AnalysisTarget.WALLET:
            follow_up = (AgentKind.PORTFOLIO, *follow_up)

        decision = RoutingDecision(
            target=target,
            address=address,
            primary_agent=_PRIMARY_AGENT[target],
            follow_up_agents=follow_up,
            services=_SERVICES[target],
            reason=reason,
        )
        logger.info(
            "execution_routed",
            target=target.value,
            address=address,
            primary_agent=decision.primary_agent.value,
            reason=reason,
        )
        return decision
