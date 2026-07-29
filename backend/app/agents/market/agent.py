"""Market Agent — token analysis from live chain data."""

from __future__ import annotations

import asyncio
from typing import Any, ClassVar, Final
from urllib.parse import urlparse

from app.agents.base import AgentMetadata, BaseAgent
from app.config import get_settings
from app.core.exceptions import ValidationError
from app.engine.context import ExecutionContext
from app.engine.result import AgentResult, Finding
from app.engine.task import Task
from app.logging import get_logger
from app.models.enums import AgentKind
from app.services.models import to_float, to_int
from app.services.web.fetcher import HostVerdict, normalize_url, resolve_host_async
from app.services.web.registry import get_web_registry

logger = get_logger(__name__)


def _chain_label() -> str:
    """How this chain is named in a finding a person will read."""
    settings = get_settings()
    return f"{settings.chain_name} ({settings.chain_id})"


REQUIRED_SERVICES: Final[tuple[str, ...]] = ("blockscout", "robinhood_rpc", "codex")


#: Daily volume as a multiple of pool depth, above which the two figures
#: cannot both be describing the same market.
#:
#: Calibrated against this chain's most-traded tokens rather than guessed:
#: USDG runs at 40x and VIRTUAL at 14x — healthy, deep markets — while
#: CASHDOG reports 745,070x and USDE 18,225x. A thousand leaves an order of
#: magnitude of headroom above anything organic observed here.
IMPLAUSIBLE_TURNOVER: Final = 1000.0


def _same_site(left: str, right: str) -> bool:
    """Whether two listed websites point at the same host.

    Compared by hostname without `www.`, so `https://x.io/` and `http://www.x.io`
    are correctly treated as the same place rather than a discrepancy.
    """
    try:
        a = (urlparse(normalize_url(left)).hostname or "").removeprefix("www.")
        b = (urlparse(normalize_url(right)).hostname or "").removeprefix("www.")
    except Exception:
        return False
    return bool(a) and a == b


class MarketAgent(BaseAgent):
    """Reads token metadata, supply, holders, and market figures."""

    metadata: ClassVar[AgentMetadata] = AgentMetadata(
        kind=AgentKind.MARKET,
        name="Market Agent",
        description=(
            "Reads on-chain market state continuously and produces structured "
            "signals instead of raw dashboards."
        ),
        version="0.4.0",
        capabilities=("liquidity_tracking", "pair_discovery", "signal_synthesis"),
    )

    implemented: ClassVar[bool] = True

    async def run(self, task: Task, context: ExecutionContext) -> AgentResult:
        address = context.routing.address if context.routing else None
        if address is None:
            return AgentResult.failure("Market analysis requires a token address.")

        blockscout = context.services.blockscout

        # Four independent reads — issued together rather than in sequence.
        # The address record is here for one reason: it names the deployer,
        # which is what makes the deployer-to-holder check possible.
        token, counters, holders, address_info = await asyncio.gather(
            blockscout.get_token(address),
            blockscout.get_token_counters(address),
            blockscout.get_token_holders(address),
            blockscout.get_address(address),
            return_exceptions=True,
        )
        context.note_service("blockscout")

        if isinstance(token, BaseException):
            raise token

        facts: dict[str, Any] = {
            "address": address,
            "name": token.name,
            "symbol": token.symbol,
            "type": token.type,
            "decimals": to_int(token.decimals),
            "total_supply_raw": token.total_supply,
            "holders_count": to_int(token.holders_count),
            "exchange_rate_usd": to_float(token.exchange_rate),
            "market_cap_usd": to_float(token.circulating_market_cap),
            "volume_24h_usd": to_float(token.volume_24h),
            "reputation": token.reputation,
        }

        if not isinstance(counters, BaseException):
            facts["transfers_count"] = to_int(counters.transfers_count)
            facts["holders_count"] = (
                to_int(counters.token_holders_count) or facts["holders_count"]
            )

        top_holders: list[dict[str, Any]] = []
        if not isinstance(holders, BaseException):
            for holder in holders.items[:10]:
                top_holders.append(
                    {
                        "address": holder.address.hash if holder.address else None,
                        "value_raw": holder.value,
                    }
                )
            facts["top_holders_sampled"] = len(holders.items)

        # Holder concentration — a real signal derived from what we fetched.
        decimals = facts.get("decimals") or 18
        supply = to_int(token.total_supply)
        if supply and top_holders:
            top_value = sum(to_int(item["value_raw"]) or 0 for item in top_holders)
            facts["top10_holder_share_pct"] = round(top_value / supply * 100, 2)
        facts["total_supply"] = (supply / 10**decimals) if supply else None

        # The address that deployed the token, and whether it is still sitting
        # on the supply. Across the chain's 25 most-traded tokens this fires
        # twice, once at 97.23% — a distribution nothing else here would show.
        if not isinstance(address_info, BaseException):
            facts["deployer"] = address_info.creator_address_hash
            facts["deployer_share_pct"] = self._deployer_share(
                address_info.creator_address_hash, top_holders, supply
            )

        context.facts["token"] = facts
        context.facts["top_holders"] = top_holders

        explorer = blockscout.explorer_url("token", address)
        context.add_source("Blockscout token page", explorer)
        context.add_source(
            "Blockscout token API",
            f"{blockscout.base_url}/api/v2/tokens/{address}",
        )

        evidence: list[Finding] = [
            Finding.confirmed(
                "token_metadata",
                "Token metadata",
                f"{token.name} ({token.symbol}) · {token.type}",
                explorer,
            ),
            Finding.confirmed(
                "holders", "Holder count", facts.get("holders_count"), explorer
            ),
            Finding.confirmed(
                "supply", "Total supply", facts.get("total_supply"), explorer
            ),
            Finding.confirmed(
                "price", "Exchange rate (USD)", facts.get("exchange_rate_usd"), explorer
            ),
            Finding.confirmed(
                "market_cap",
                "Circulating market cap (USD)",
                facts.get("market_cap_usd"),
                explorer,
            ),
            Finding.confirmed(
                "volume", "24h volume (USD)", facts.get("volume_24h_usd"), explorer
            ),
            Finding.confirmed(
                "transfers", "Transfer count", facts.get("transfers_count"), explorer
            ),
        ]

        if "top10_holder_share_pct" in facts:
            evidence.append(
                Finding.confirmed(
                    "concentration",
                    "Top-10 holder share (%)",
                    facts["top10_holder_share_pct"],
                    explorer,
                )
            )
        elif isinstance(holders, BaseException):
            # Concentration is the strongest signal this agent produces. Its
            # absence must never be mistaken for a well-distributed token.
            evidence.append(
                Finding.unknown(
                    "concentration",
                    "Top-10 holder share (%)",
                    reason=(
                        "The explorer did not return the holder list "
                        f"({type(holders).__name__}), so concentration could "
                        "not be measured."
                    ),
                    source_url=explorer,
                )
            )

        share = facts.get("deployer_share_pct")
        if facts.get("deployer"):
            evidence.append(
                Finding.confirmed(
                    "deployer",
                    "Deployed by",
                    facts["deployer"],
                    blockscout.explorer_url("address", facts["deployer"]),
                )
            )
        if isinstance(share, int | float) and share > 0:
            evidence.append(
                Finding.confirmed(
                    "deployer_holding",
                    "Deployer still holds",
                    f"{share}% of supply",
                    explorer,
                )
            )
        elif facts.get("deployer") and top_holders:
            evidence.append(
                Finding.confirmed(
                    "deployer_holding",
                    "Deployer is among the top 10 holders",
                    False,
                    explorer,
                )
            )

        evidence += await self._try_codex(address, context, facts)
        evidence += await self._tradability(address, facts, context)

        return AgentResult.ok(
            summary=f"Collected market data for {token.symbol or address}.",
            output={"token": facts},
            evidence=evidence,
        )

    async def _tradability(
        self, address: str, facts: dict[str, Any], context: ExecutionContext
    ) -> list[Finding]:
        """Can this token actually be sold, and who can stop that?

        Nothing else in the pipeline answers this. Holder counts and prices
        describe a token; they do not tell you the sell function reverts.

        GoPlus also reports the creator's share, which this agent measures
        independently from the explorer. Where the two disagree materially,
        that disagreement is reported rather than resolved silently — one of
        them is wrong and the reader deserves to know it is in doubt.
        """
        registry = get_web_registry()
        context.note_service("goplus")

        try:
            security = await registry.goplus.token_security(address)
        except Exception as exc:
            return [
                Finding.unknown(
                    "tradability",
                    "Can be sold (honeypot check)",
                    reason=f"The GoPlus lookup failed ({type(exc).__name__}).",
                )
            ]

        if not security.found:
            return [
                Finding.unknown(
                    "tradability",
                    "Can be sold (honeypot check)",
                    reason="GoPlus holds no security record for this token.",
                )
            ]

        facts["security"] = {
            "is_honeypot": security.is_honeypot,
            "cannot_sell_all": security.cannot_sell_all,
            "transfer_pausable": security.transfer_pausable,
            "is_blacklisted": security.is_blacklisted,
            "hidden_owner": security.hidden_owner,
            "can_take_back_ownership": security.can_take_back_ownership,
            "buy_tax_pct": security.buy_tax,
            "sell_tax_pct": security.sell_tax,
            "creator_percent": security.creator_percent,
            "liquidity_usd": security.liquidity_usd,
            "pools": security.pools,
            "lp_holder_count": security.lp_holder_count,
        }
        context.add_source("GoPlus token security", f"{registry.goplus.base_url}/")

        findings: list[Finding] = []
        blocking = security.blocking_signals

        if security.is_honeypot is None:
            findings.append(
                Finding.unknown(
                    "tradability",
                    "Can be sold (honeypot check)",
                    reason="GoPlus did not determine whether this token can be sold.",
                )
            )
        elif blocking:
            findings.append(
                Finding.refuted(
                    "tradability",
                    "Can be freely sold",
                    value=", ".join(blocking),
                    reason=f"GoPlus reports that this token {blocking[0]}.",
                )
            )
        else:
            findings.append(
                Finding.confirmed("tradability", "Can be sold (honeypot check)", True)
            )

        for label, value in (
            ("Buy tax (%)", security.buy_tax),
            ("Sell tax (%)", security.sell_tax),
        ):
            if value is not None:
                findings.append(
                    Finding.confirmed(label.split()[0].lower() + "_tax", label, value)
                )

        for kind, label, value in (
            ("hidden_owner", "Hidden owner", security.hidden_owner),
            (
                "reclaimable_ownership",
                "Ownership can be taken back",
                security.can_take_back_ownership,
            ),
            ("pausable", "Transfers can be paused", security.transfer_pausable),
        ):
            if value is True:
                findings.append(Finding.confirmed(kind, label, True))

        findings += self._compare_deployer_share(security, facts)
        findings += self._check_volume_is_backed(security, facts)
        return findings

    @staticmethod
    def _check_volume_is_backed(security: Any, facts: dict[str, Any]) -> list[Finding]:
        """Could the reported volume have happened in the pool that exists?

        The strongest check available, and it needed no new source — GoPlus was
        already returning pool depth and the field was being discarded.

        Turnover is volume divided by liquidity. A busy pool genuinely turns
        over many times a day; USDG runs at 40x and VIRTUAL at 14x, which is
        what a real market looks like. CASHDOG reports $284,189,685 of 24h
        volume against $381 of pool — 745,070x. That is not a market being
        busy, it is two sources describing different worlds.

        Deliberately reported as a contradiction between sources rather than as
        an accusation of wash trading. Either figure could be the wrong one,
        and saying which would be inventing a conclusion the data does not
        carry.
        """
        volume = facts.get("volume_24h_usd")
        liquidity = security.liquidity_usd

        if not isinstance(volume, int | float) or volume <= 0:
            return []

        if liquidity is None:
            return [
                Finding.unknown(
                    "volume_backed",
                    "Reported volume is backed by a pool",
                    reason=(
                        "GoPlus returned no pool data for this token, so the "
                        f"${volume:,.0f} of reported 24h volume could not be "
                        "corroborated either way."
                    ),
                )
            ]

        facts["liquidity_usd"] = liquidity

        if liquidity <= 0:
            # Not "there is no market" — GoPlus indexes a limited set of DEXes,
            # and trading may be happening somewhere it does not see.
            return [
                Finding.unknown(
                    "volume_backed",
                    "Reported volume is backed by a pool",
                    reason=(
                        f"The explorer reports ${volume:,.0f} of 24h volume "
                        "while GoPlus indexes no liquidity pool at all. One of "
                        "them is missing something, so neither is presented as "
                        "settled."
                    ),
                )
            ]

        turnover = volume / liquidity
        facts["volume_to_liquidity"] = round(turnover, 1)

        if turnover < IMPLAUSIBLE_TURNOVER:
            return [
                Finding.confirmed(
                    "volume_backed",
                    "24h volume against pool depth",
                    f"${liquidity:,.0f} liquidity, {turnover:,.0f}x turnover",
                )
            ]

        return [
            Finding.refuted(
                "volume_backed",
                "Reported volume is backed by a pool",
                value=f"${liquidity:,.0f} liquidity vs ${volume:,.0f} volume",
                reason=(
                    f"The explorer reports ${volume:,.0f} of 24h volume against "
                    f"${liquidity:,.0f} of pool depth — {turnover:,.0f} times "
                    "the pool, every day. A real market of that size would need "
                    "far deeper liquidity, so the two sources disagree about "
                    "whether this market exists."
                ),
            )
        ]

    async def _check_name_reuse(
        self,
        symbol: str | None,
        website: str | None,
        facts: dict[str, Any],
        context: ExecutionContext,
    ) -> list[Finding]:
        """Does this ticker already mean something on another chain?

        Sharing a name is normal — bridged tokens do it by design, and a
        genuine bridge lists the same places as the original. What is worth
        reporting is a token carrying an established name while pointing
        somewhere else entirely.

        VIRTUAL is the case this was built from: on Base it lists
        `linktr.ee/virtualprotocol`, on this chain `virtualsrh.lol`.

        Deliberately not framed as an accusation. The finding states what both
        listings say and leaves the conclusion to the reader.
        """
        if not symbol:
            return []

        try:
            matches = await context.services.codex.find_by_symbol(symbol)
        except Exception as exc:
            logger.warning("symbol_lookup_failed", error=str(exc))
            return []

        elsewhere = [
            row
            for row in matches
            if isinstance(row.get("token"), dict)
            and row["token"].get("networkId") != get_settings().chain_id
            and (row["token"].get("symbol") or "").upper() == symbol.upper()
        ]
        if not elsewhere:
            return []

        # Ranked by volume, so the first is the most established use.
        original = elsewhere[0]["token"]
        their_site = (original.get("socialLinks") or {}).get("website")
        facts["symbol_also_on_networks"] = [
            row["token"].get("networkId") for row in elsewhere
        ]

        if not their_site or not website:
            return [
                Finding.confirmed(
                    "symbol_reuse",
                    "Ticker also used on other chains",
                    f"{symbol} appears on {len(elsewhere)} other network(s)",
                )
            ]

        if _same_site(their_site, website):
            return [
                Finding.confirmed(
                    "symbol_reuse",
                    "Ticker matches the same project elsewhere",
                    f"{symbol} lists the same website on {len(elsewhere)} other chain(s)",
                )
            ]

        facts["symbol_elsewhere_website"] = their_site
        return [
            Finding.refuted(
                "symbol_reuse",
                "Ticker points to the same project as elsewhere",
                value=f"here: {website} / elsewhere: {their_site}",
                reason=(
                    f"{symbol} is also listed on network "
                    f"{original.get('networkId')} with a different website. "
                    "Same ticker, different destination."
                ),
            )
        ]

    @staticmethod
    def _compare_deployer_share(security: Any, facts: dict[str, Any]) -> list[Finding]:
        """Two independent measurements of the deployer's holding.

        This platform derives it from the explorer's holder list; GoPlus
        derives it their own way. On AP the two agreed to four decimal places
        (97.2345% against 97.23%), which is the outcome that makes the number
        trustworthy. A gap means one source is stale or wrong.
        """
        ours = facts.get("deployer_share_pct")
        theirs = security.creator_percent

        if not isinstance(ours, int | float) or not isinstance(theirs, int | float):
            return []

        facts["deployer_share_goplus_pct"] = theirs

        # A percentage point of slack absorbs rounding and block-height skew
        # between the two reads without hiding a real disagreement.
        if abs(ours - theirs) <= 1.0:
            return [
                Finding.confirmed(
                    "deployer_share_corroborated",
                    "Deployer holding confirmed by a second source",
                    f"{ours}% (GoPlus: {theirs}%)",
                )
            ]

        return [
            Finding.unknown(
                "deployer_share_corroborated",
                "Deployer holding agreed by both sources",
                reason=(
                    f"The explorer gives {ours}% and GoPlus gives {theirs}%. "
                    "One of them is stale or wrong, so neither is presented "
                    "as settled."
                ),
            )
        ]

    @staticmethod
    def _deployer_share(
        deployer: str | None, top_holders: list[dict[str, Any]], supply: int | None
    ) -> float | None:
        """How much of the supply the deploying address still holds.

        Returns 0.0 when the deployer is demonstrably not a top holder, and
        None when the question could not be answered at all. Those are
        different answers and the caller distinguishes them.
        """
        if not deployer or not supply or not top_holders:
            return None

        target = deployer.lower()
        held = sum(
            to_int(item["value_raw"]) or 0
            for item in top_holders
            if (item.get("address") or "").lower() == target
        )
        return round(held / supply * 100, 2)

    async def _try_codex(
        self, address: str, context: ExecutionContext, facts: dict[str, Any]
    ) -> list[Finding]:
        """Enrich with Codex if it is configured *and* indexes this chain.

        Both conditions are checked rather than assumed, and each failure
        returns an `unknown` finding. The declared website in particular is a
        fact the caller may act on, so "we could not ask" has to be visible
        rather than looking like "the token declares nothing".
        """
        codex = context.services.codex
        label = "Listed links (website, socials)"

        if not codex.is_configured:
            facts["codex"] = {
                "state": "not_configured",
                "detail": "CODEX_API_KEY is not set.",
            }
            return [
                Finding.unknown(
                    "codex_links", label, reason="Codex is not configured on this server."
                )
            ]

        try:
            if not await codex.supports_network():
                facts["codex"] = {
                    "state": "unsupported_network",
                    "detail": f"Codex does not index {_chain_label()}.",
                }
                return [
                    Finding.unknown(
                        "codex_links",
                        label,
                        reason=f"Codex does not index {_chain_label()}.",
                    )
                ]

            price, links = await asyncio.gather(
                codex.get_token_price(address),
                codex.social_links(address),
                return_exceptions=True,
            )
            context.note_service("codex")
            facts["codex"] = {
                "state": "live",
                "price": None if isinstance(price, BaseException) else price,
            }
            context.add_source("Codex market data", f"{codex.base_url}/graphql")

            if isinstance(links, BaseException):
                return [
                    Finding.unknown(
                        "codex_links",
                        label,
                        reason=(
                            "Codex did not return declared links "
                            f"({type(links).__name__})."
                        ),
                    )
                ]
            return await self._check_declared_site(links, facts, context)
        except Exception as exc:
            logger.warning("codex_enrichment_failed", error=str(exc))
            facts["codex"] = {"state": "error", "detail": type(exc).__name__}
            return [
                Finding.unknown(
                    "codex_links",
                    label,
                    reason=f"The Codex request failed ({type(exc).__name__}).",
                )
            ]

    async def _check_declared_site(
        self,
        links: dict[str, Any],
        facts: dict[str, Any],
        context: ExecutionContext,
    ) -> list[Finding]:
        """Test the website listed for this token on this chain.

        The whole point of this platform is that a claim and a fact are
        different things. A listed website is a claim; whether the domain
        exists is checkable in under a second, and the answer is often the
        most useful line in the report.

        Attribution matters here and was got wrong once. This metadata is
        per-chain, supplied by whoever listed the token, so the wording says
        "listed" rather than implying the project stated it.

        Deliberately shallow: this resolves the domain and reads its
        registration. A full site analysis takes 15 seconds and belongs behind
        the dedicated `site` target, not inside every token lookup.
        """
        facts["declared_links"] = links
        website = links.get("website")

        findings: list[Finding] = []
        for platform in ("twitter", "telegram", "discord"):
            if links.get(platform):
                findings.append(
                    Finding.confirmed(
                        f"declared_{platform}", f"Listed {platform}", links[platform]
                    )
                )

        if not isinstance(website, str) or not website:
            findings.append(
                Finding.confirmed(
                    "declared_website", "A website is listed for this token", False
                )
            )
            return findings

        findings.append(
            Finding.confirmed("declared_website", "Listed website", website, website)
        )

        # Run before the resolve branches, not after. It was placed after the
        # success path, so the case it was written for — VIRTUAL, whose listed
        # site is dead *and* whose ticker is established elsewhere — returned
        # early and never reached it. The two checks are independent.
        findings += await self._check_name_reuse(
            facts.get("symbol"), website, facts, context
        )

        try:
            url = normalize_url(website)
        except ValidationError:
            findings.append(
                Finding.refuted(
                    "declared_website_valid",
                    "Listed website is a usable URL",
                    value=website,
                    reason="The declared website is not a well-formed http(s) URL.",
                )
            )
            return findings

        domain = urlparse(url).hostname or ""
        verdict = await resolve_host_async(domain)
        facts["declared_website_resolves"] = verdict is HostVerdict.PUBLIC

        if verdict is HostVerdict.UNRESOLVABLE:
            findings.append(
                Finding.refuted(
                    "declared_website_resolves",
                    "Listed website resolves",
                    value=domain,
                    reason=(
                        f"{domain} has no DNS records. The website listed for "
                        "this token on this chain does not exist."
                    ),
                    source_url=url,
                )
            )
            return findings

        if verdict is HostVerdict.NOT_PUBLIC:
            findings.append(
                Finding.refuted(
                    "declared_website_resolves",
                    "Listed website resolves publicly",
                    value=domain,
                    reason=f"{domain} resolves to a private or reserved address.",
                )
            )
            return findings

        findings.append(
            Finding.confirmed(
                "declared_website_resolves", "Listed website resolves", True, url
            )
        )

        # Domain age is the second half of the signal: a token whose site was
        # registered days ago is a different proposition to one registered in
        # 2015. Best-effort — RDAP has no coverage for some TLDs.
        try:
            registration = await get_web_registry().rdap.lookup(domain)
        except Exception as exc:
            findings.append(
                Finding.unknown(
                    "declared_website_age",
                    "Listed website domain age",
                    reason=f"The registration lookup failed ({type(exc).__name__}).",
                )
            )
            return findings

        if registration.found and registration.created:
            facts["declared_website_registered"] = registration.created
            findings.append(
                Finding.confirmed(
                    "declared_website_age",
                    "Listed website registered",
                    registration.created,
                )
            )
        else:
            findings.append(
                Finding.unknown(
                    "declared_website_age",
                    "Listed website domain age",
                    reason=f"No RDAP registry answered for {domain}.",
                )
            )

        return findings


AGENT = MarketAgent
