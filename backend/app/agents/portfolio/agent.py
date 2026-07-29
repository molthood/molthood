"""Portfolio Agent — screens every token a wallet actually holds.

The rest of the platform answers "is this token safe" for a token you already
suspected. That is the wrong way round: people hold wallets, not addresses they
were already worried about. This agent inverts it — given a wallet, it screens
the positions and surfaces the ones worth looking at.

It runs after the Project Agent, which has already fetched the balances, and
before the Risk Agent, which folds the worst position into the wallet's score.

Two honesty constraints shape the whole file:

* **The same rules.** Scoring reuses `risk.signals`, so a token screened here
  is judged exactly as it would be by a full token analysis. A screen is a
  narrower *view*, never a softer standard.
* **The score is a ceiling.** A screen runs four checks. Where one of them
  could not answer, the score is marked as an upper bound: the missing check
  can only ever have lowered it. Presenting a partial screen as a flat number
  would let a gap read as a clean result, which is the failure mode this
  codebase exists to avoid.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, ClassVar, Final

from app.agents.base import AgentMetadata, BaseAgent
from app.agents.risk.signals import level_for, score_for, token_signals
from app.config import get_settings
from app.engine.context import ExecutionContext
from app.engine.result import AgentResult, Finding
from app.engine.task import Task
from app.logging import get_logger
from app.models.enums import AgentKind
from app.services.models import to_float, to_int
from app.services.web.registry import get_web_registry

logger = get_logger(__name__)

REQUIRED_SERVICES: Final[tuple[str, ...]] = ("blockscout", "goplus")

#: Explorer reads per holding. Held low deliberately: a wallet with thirty
#: positions would otherwise issue over a hundred requests and be rate-limited
#: into returning nothing at all.
SCREEN_CONCURRENCY: Final = 4

#: A screen scoring below this is worth the reader's attention. Above it, the
#: holding is listed but not called out.
ATTENTION_BELOW: Final = 80

#: The four questions a screen asks. Named so a holding can report which of
#: them actually got an answer.
CHECKS: Final[tuple[str, ...]] = ("metadata", "concentration", "deployer", "sellability")


@dataclass(slots=True)
class HoldingScreen:
    """One position, screened."""

    address: str
    symbol: str | None = None
    name: str | None = None
    amount: float | None = None
    value_usd: float | None = None

    #: Where this position can be checked independently. Carried in the facts
    #: rather than rebuilt client-side so the console never has to know which
    #: explorer this chain uses.
    explorer_url: str | None = None

    score: int | None = None
    level: str = "unscored"
    signals: list[dict[str, Any]] = field(default_factory=list)
    checks_run: list[str] = field(default_factory=list)
    checks_missed: list[str] = field(default_factory=list)
    #: True when a check could not run, so the real score is at most `score`.
    is_upper_bound: bool = False
    error: str | None = None

    @property
    def needs_attention(self) -> bool:
        return self.score is not None and self.score < ATTENTION_BELOW

    def to_dict(self) -> dict[str, Any]:
        return {
            "address": self.address,
            "symbol": self.symbol,
            "name": self.name,
            "amount": self.amount,
            "value_usd": self.value_usd,
            "explorer_url": self.explorer_url,
            "score": self.score,
            "level": self.level,
            "signals": self.signals,
            "checks_run": self.checks_run,
            "checks_missed": self.checks_missed,
            "is_upper_bound": self.is_upper_bound,
            "error": self.error,
        }


class PortfolioAgent(BaseAgent):
    """Screens the token positions held by one wallet."""

    metadata: ClassVar[AgentMetadata] = AgentMetadata(
        kind=AgentKind.PORTFOLIO,
        name="Portfolio Agent",
        description=(
            "Screens every token a wallet holds against the same rules a full "
            "token analysis applies, and surfaces the positions worth a look."
        ),
        version="0.1.0",
        capabilities=("holding_screen", "exposure_ranking", "shared_scoring"),
    )

    implemented: ClassVar[bool] = True

    async def run(self, task: Task, context: ExecutionContext) -> AgentResult:
        holdings = context.facts.get("holdings")
        if not isinstance(holdings, list):
            # The Project Agent runs first and writes this. Reaching here means
            # the wallet read failed, which it has already reported.
            return AgentResult.ok(
                summary="No holdings were available to screen.",
                evidence=[
                    Finding.unknown(
                        "portfolio",
                        "Holdings screened",
                        reason=(
                            "The wallet's token balances were not collected, so "
                            "no position could be screened."
                        ),
                    )
                ],
            )

        candidates = [
            item
            for item in holdings
            if isinstance(item, dict) and isinstance(item.get("address"), str)
        ]
        if not candidates:
            context.facts["portfolio"] = {
                "holdings": [],
                "screened": 0,
                "total_holdings": 0,
                "flagged": 0,
                "unscored": 0,
                "skipped": [],
            }
            return AgentResult.ok(
                summary="This wallet holds no tokens.",
                output={"portfolio": {"screened": 0}},
                evidence=[Finding.confirmed("portfolio", "Token positions held", 0)],
            )

        limit = get_settings().portfolio_max_holdings
        ranked = self._rank(candidates)
        selected, skipped = ranked[:limit], ranked[limit:]

        semaphore = asyncio.Semaphore(SCREEN_CONCURRENCY)
        screens = await asyncio.gather(
            *(self._screen(item, context, semaphore) for item in selected)
        )
        context.note_service("blockscout")
        context.note_service("goplus")

        # Worst first: the reason to open a portfolio report is the position
        # that needs attention, not the alphabetical order of the tickers.
        screens.sort(key=lambda screen: (screen.score is None, screen.score or 0))

        summary_facts: dict[str, Any] = {
            "holdings": [screen.to_dict() for screen in screens],
            "screened": len(screens),
            "total_holdings": len(candidates),
            "flagged": sum(1 for screen in screens if screen.needs_attention),
            "unscored": sum(1 for screen in screens if screen.score is None),
            "skipped": [
                {"address": item["address"], "symbol": item.get("symbol")}
                for item in skipped
            ],
        }
        context.facts["portfolio"] = summary_facts

        return AgentResult.ok(
            summary=self._summary_line(summary_facts),
            output={"portfolio": summary_facts},
            evidence=self._evidence(screens, summary_facts, context),
        )

    # --- selection ---

    @staticmethod
    def _rank(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Largest positions first, by USD value where it is known.

        Most tokens on this chain have no quoted rate, so an unpriced holding
        keeps its explorer position rather than sinking to the bottom — the
        explorer already orders balances by value, and a token being unpriced
        is not evidence that it is small.
        """
        priced = [
            item for item in candidates if isinstance(item.get("value_usd"), int | float)
        ]
        unpriced = [
            item
            for item in candidates
            if not isinstance(item.get("value_usd"), int | float)
        ]
        priced.sort(key=lambda item: float(item["value_usd"]), reverse=True)
        return priced + unpriced

    # --- screening ---

    async def _screen(
        self,
        holding: dict[str, Any],
        context: ExecutionContext,
        semaphore: asyncio.Semaphore,
    ) -> HoldingScreen:
        address = str(holding["address"])
        screen = HoldingScreen(
            address=address,
            symbol=holding.get("symbol"),
            name=holding.get("name"),
            amount=holding.get("amount"),
            value_usd=holding.get("value_usd"),
            explorer_url=context.services.blockscout.explorer_url("token", address),
        )

        async with semaphore:
            facts, missed = await self._collect(address, context)

        screen.checks_missed = missed
        screen.checks_run = [check for check in CHECKS if check not in missed]

        if "metadata" in missed:
            # Without the token record there is nothing to score against, and a
            # score derived from three empty inputs would be a fabricated 100.
            screen.error = "The explorer returned no record for this token."
            return screen

        signals = token_signals(facts)
        screen.signals = [signal.to_dict() for signal in signals]

        # Same rule the Risk Agent applies to a whole subject: silence plus a
        # gap is not a clean result, it is an unscored one.
        if not signals and missed:
            return screen

        screen.score = score_for(signals)
        screen.level = level_for(screen.score)
        screen.is_upper_bound = bool(missed)
        return screen

    async def _collect(
        self, address: str, context: ExecutionContext
    ) -> tuple[dict[str, Any], list[str]]:
        """Gather exactly the inputs `token_signals` reads, and name the misses."""
        blockscout = context.services.blockscout
        goplus = get_web_registry().goplus

        token, holders, address_info, security = await asyncio.gather(
            blockscout.get_token(address),
            blockscout.get_token_holders(address),
            blockscout.get_address(address),
            goplus.token_security(address),
            return_exceptions=True,
        )

        missed: list[str] = []
        facts: dict[str, Any] = {}

        if isinstance(token, BaseException):
            return facts, list(CHECKS)

        facts.update(
            {
                "holders_count": to_int(token.holders_count),
                "volume_24h_usd": to_float(token.volume_24h),
                "reputation": token.reputation,
            }
        )

        supply = to_int(token.total_supply)
        top_holders: list[dict[str, Any]] = []
        if isinstance(holders, BaseException) or not supply:
            missed.append("concentration")
        else:
            top_holders = [
                {
                    "address": holder.address.hash if holder.address else None,
                    "value_raw": holder.value,
                }
                for holder in holders.items[:10]
            ]
            held = sum(to_int(item["value_raw"]) or 0 for item in top_holders)
            facts["top10_holder_share_pct"] = round(held / supply * 100, 2)

        creator = (
            ""
            if isinstance(address_info, BaseException)
            else (address_info.creator_address_hash or "")
        )
        if not creator or not supply or not top_holders:
            missed.append("deployer")
        else:
            owned = sum(
                to_int(item["value_raw"]) or 0
                for item in top_holders
                if (item.get("address") or "").lower() == creator.lower()
            )
            facts["deployer"] = creator
            facts["deployer_share_pct"] = round(owned / supply * 100, 2)

        # A `None` honeypot flag is not a pass. It means GoPlus did not answer,
        # and the screen has to say so rather than let the absence read as safe.
        if (
            isinstance(security, BaseException)
            or not security.found
            or security.is_honeypot is None
        ):
            missed.append("sellability")
        else:
            facts["security"] = {
                "is_honeypot": security.is_honeypot,
                "cannot_sell_all": security.cannot_sell_all,
                "transfer_pausable": security.transfer_pausable,
                "is_blacklisted": security.is_blacklisted,
                "hidden_owner": security.hidden_owner,
                "can_take_back_ownership": security.can_take_back_ownership,
                "buy_tax_pct": security.buy_tax,
                "sell_tax_pct": security.sell_tax,
            }

        return facts, missed

    # --- reporting ---

    @staticmethod
    def _summary_line(facts: dict[str, Any]) -> str:
        parts = [f"Screened {facts['screened']} of {facts['total_holdings']} holdings"]
        if facts["flagged"]:
            parts.append(f"{facts['flagged']} need attention")
        if facts["unscored"]:
            parts.append(f"{facts['unscored']} could not be scored")
        return f"{'; '.join(parts)}."

    def _evidence(
        self,
        screens: list[HoldingScreen],
        facts: dict[str, Any],
        context: ExecutionContext,
    ) -> list[Finding]:
        blockscout = context.services.blockscout
        wallet = context.routing.address if context.routing else None

        findings: list[Finding] = [
            Finding.confirmed(
                "portfolio",
                "Token positions held",
                facts["total_holdings"],
                blockscout.explorer_url("address", wallet) if wallet else None,
            ),
            Finding.confirmed(
                "portfolio_screened", "Positions screened", facts["screened"]
            ),
        ]

        for screen in screens:
            label = screen.symbol or screen.address
            url = blockscout.explorer_url("token", screen.address)

            if screen.score is None:
                findings.append(
                    Finding.unknown(
                        "holding_unscored",
                        f"{label} screened",
                        reason=(
                            screen.error
                            or (
                                f"{', '.join(screen.checks_missed)} could not be "
                                "checked and nothing else fired, so no score is "
                                "reported for this position."
                            )
                        ),
                        source_url=url,
                    )
                )
                continue

            prefix = "at most " if screen.is_upper_bound else ""
            findings.append(
                Finding.confirmed(
                    "holding_flagged" if screen.needs_attention else "holding_clear",
                    f"{label} risk score",
                    f"{prefix}{screen.score}/100 ({screen.level})",
                    url,
                )
            )

        # Positions past the cap are named, not silently dropped. A reader who
        # cannot see that eight of thirty were screened will assume thirty were.
        if facts["skipped"]:
            names = ", ".join(
                str(item["symbol"] or item["address"][:10])
                for item in facts["skipped"][:8]
            )
            findings.append(
                Finding.unknown(
                    "portfolio_skipped",
                    "Remaining positions screened",
                    reason=(
                        f"{len(facts['skipped'])} smaller position(s) were not "
                        f"screened in this run: {names}. Analyse them "
                        "individually to score them."
                    ),
                )
            )

        return findings


AGENT = PortfolioAgent
