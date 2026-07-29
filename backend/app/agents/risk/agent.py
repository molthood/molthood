"""Risk Agent — scores an execution from evidence already collected.

Runs after the data-gathering agents and calls no external service itself. It
reads `context.facts` and applies explicit, inspectable rules, so every point
of the score can be traced to a specific on-chain observation.

The rules themselves live in `signals.py`, shared with the Portfolio Agent so
one token cannot be scored two different ways by one platform.
"""

from __future__ import annotations

from typing import Any, ClassVar, Final

from app.agents.base import AgentMetadata, BaseAgent
from app.agents.risk.signals import (
    RiskSignal,
    contract_signals,
    level_for,
    score_for,
    token_signals,
    wallet_signals,
)
from app.engine.context import ExecutionContext
from app.engine.result import AgentResult, Finding
from app.engine.task import Task
from app.logging import get_logger
from app.models.enums import AgentKind, EvidenceState

logger = get_logger(__name__)

REQUIRED_SERVICES: Final[tuple[str, ...]] = ()


class RiskAgent(BaseAgent):
    """Turns collected evidence into a transparent risk score."""

    metadata: ClassVar[AgentMetadata] = AgentMetadata(
        kind=AgentKind.RISK,
        name="Risk Agent",
        description=(
            "Scores every proposed execution before it runs and blocks the ones "
            "that fall outside policy."
        ),
        version="0.5.0",
        capabilities=("policy_enforcement", "exposure_limits", "pre_flight_simulation"),
    )

    implemented: ClassVar[bool] = True

    async def run(self, task: Task, context: ExecutionContext) -> AgentResult:
        signals: list[RiskSignal] = []

        signals.extend(contract_signals(context.facts.get("contract") or {}))
        signals.extend(token_signals(context.facts.get("token") or {}))
        signals.extend(wallet_signals(context.facts.get("wallet") or {}))
        signals.extend(self._coherence_signals(context))
        signals.extend(self._portfolio_signals(context.facts.get("portfolio") or {}))

        score = score_for(signals)
        level = level_for(score)

        assessment: dict[str, Any] = {
            "score": score,
            "level": level,
            "signals": [signal.to_dict() for signal in signals],
            "signals_count": len(signals),
            "basis": "Derived from collected on-chain evidence only.",
        }
        context.facts["risk"] = assessment

        gaps = self._coverage_gaps(context)
        assessment["coverage_gaps"] = [gap.label for gap in gaps]

        # A score built on missing inputs is not a low-risk score, it is an
        # unscored subject. Reporting 100/100 there would be the single most
        # harmful thing this agent could do, so the score is withheld outright
        # rather than shown next to a caveat a reader may skip.
        if not signals and gaps:
            evidence: list[Finding] = [
                Finding.unknown(
                    "risk_score",
                    "Risk score (0-100, higher is safer)",
                    reason=(
                        "No risk signal could be evaluated, because "
                        f"{gaps[0].reason} A clean score would be misleading."
                    ),
                )
            ]
            return AgentResult.ok(
                summary="Risk could not be scored — the required evidence is missing.",
                output={"risk": assessment},
                evidence=evidence + gaps,
            )

        evidence = [
            Finding.confirmed("risk_score", "Risk score (0-100, higher is safer)", score),
            Finding.confirmed("risk_level", "Risk level", level),
        ]
        evidence.extend(
            Finding.confirmed(
                f"risk_signal:{signal.code}", signal.detail, signal.severity
            )
            for signal in signals
        )
        evidence.extend(gaps)

        note = f" {len(gaps)} check(s) could not run." if gaps else ""
        scored = f"Risk score {score}/100 ({level}) from {len(signals)} signals."
        return AgentResult.ok(
            summary=f"{scored}{note}",
            output={"risk": assessment},
            evidence=evidence,
        )

    def _coherence_signals(self, context: ExecutionContext) -> list[RiskSignal]:
        """Every claim by the subject that turned out not to hold.

        This runs over the evidence the earlier agents produced rather than
        over `facts`, so any future coherence check feeds the score with no
        change here.

        It exists because of a concrete failure: VIRTUAL declares the website
        `virtualsrh.lol`, which has no DNS records at all, and the score still
        came out 100/100 "low". A subject caught misdescribing itself is the
        clearest signal available, and it was being ignored.
        """
        weights = {
            "declared_website_resolves": 25,
            "declared_website_valid": 15,
            "resolves": 25,
            "bytecode_match": 35,
            "metadata_mismatch": 8,
            "security_expired": 5,
            # Deliberately modest. Bridged tokens legitimately share a ticker,
            # and the listings that carry these links are per-chain metadata
            # rather than statements by either project. Worth surfacing, not
            # worth condemning a token over on its own.
            "symbol_reuse": 10,
            # A reported volume the pool could not physically have supported.
            # Heavy: it means the headline number a buyer is reacting to is
            # not corroborated by the market it claims to describe.
            "volume_backed": 30,
        }

        signals: list[RiskSignal] = []
        for item in context.evidence:
            if item.state is not EvidenceState.REFUTED:
                continue
            weight = weights.get(item.kind, 10)
            signals.append(
                RiskSignal(
                    code=f"refuted:{item.kind}",
                    severity="high" if weight >= 25 else "medium",
                    detail=item.reason or f"{item.label} does not hold.",
                    weight=weight,
                )
            )

        return signals

    def _portfolio_signals(self, portfolio: dict[str, Any]) -> list[RiskSignal]:
        """What the wallet is actually holding.

        A wallet's own record can be spotless while every position in it is in
        something unsellable. Scoring the address without looking at what it
        holds would report exactly that wallet as low risk.

        The weight comes from the worst position rather than the sum: holding
        three flagged tokens is bad, but it is not three times worse than one,
        and summing would drive every diversified wallet to zero.
        """
        holdings = portfolio.get("holdings") or []
        flagged = [
            item
            for item in holdings
            if isinstance(item, dict) and isinstance(item.get("score"), int)
        ]
        if not flagged:
            return []

        worst = min(flagged, key=lambda item: int(item["score"]))
        worst_score = int(worst["score"])
        if worst_score >= 80:
            return []

        symbol = worst.get("symbol") or worst.get("address") or "a holding"
        count = sum(1 for item in flagged if int(item["score"]) < 80)
        detail = f"{symbol} scores {worst_score}/100"
        if count > 1:
            detail += f", and {count - 1} other holding(s) also fall below 80"

        # Mirrors the shortfall of the worst position, halved: the wallet is
        # exposed to it, not identical to it.
        weight = min(40, (100 - worst_score) // 2)
        if worst_score < 35:
            severity = "critical"
        elif worst_score < 60:
            severity = "high"
        else:
            severity = "medium"
        return [RiskSignal("holding_flagged", severity, f"{detail}.", weight)]

    def _coverage_gaps(self, context: ExecutionContext) -> list[Finding]:
        """Checks that could not be performed, named individually.

        Without this the score silently reflects only what happened to be
        available: a token whose holder list failed to load scores identically
        to one that is genuinely well distributed.
        """
        gaps: list[Finding] = []
        token = context.facts.get("token") or {}
        contract = context.facts.get("contract") or {}

        if token and token.get("security", {}).get("is_honeypot") is None:
            gaps.append(
                Finding.unknown(
                    "risk_gap:tradability",
                    "Sellability reviewed",
                    reason=(
                        "no honeypot verdict was available, so whether the "
                        "token can be sold was not scored."
                    ),
                )
            )

        if token and token.get("security", {}).get("liquidity_usd") is None:
            gaps.append(
                Finding.unknown(
                    "risk_gap:liquidity",
                    "Pool depth reviewed",
                    reason=(
                        "no liquidity figure was available, so whether the "
                        "reported volume is backed by a real pool was not "
                        "scored."
                    ),
                )
            )

        if token and not isinstance(token.get("top10_holder_share_pct"), int | float):
            gaps.append(
                Finding.unknown(
                    "risk_gap:concentration",
                    "Holder concentration reviewed",
                    reason=(
                        "the holder list was unavailable, so supply "
                        "concentration was not scored."
                    ),
                )
            )

        if contract and contract.get("is_verified") is False:
            gaps.append(
                Finding.unknown(
                    "risk_gap:source",
                    "Contract source reviewed",
                    reason=(
                        "the source is unverified, so it could not be scanned "
                        "for dangerous patterns."
                    ),
                )
            )

        if not token and not contract and not context.facts.get("wallet"):
            gaps.append(
                Finding.unknown(
                    "risk_gap:subject",
                    "Subject evidence collected",
                    reason="no on-chain evidence reached this agent.",
                )
            )

        return gaps


AGENT = RiskAgent
