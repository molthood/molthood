"""What changed since the last time we looked at this subject.

A single analysis is a photograph. Most of what this platform checks — a
website that resolves, an owner who has renounced, a supply that is fixed — is
only meaningfully false *at some point in time*, and the point is usually after
someone has already bought. A launch is coherent on day one by construction;
the interesting question is whether it still is on day thirty.

Persistence made this cheap: every run is already stored with its evidence, so
comparing the current run against the last one of the same subject costs one
indexed read and no network at all.

The hard part is not diffing, it is silence. A comparison that reports every
moved decimal trains the reader to skip it, which is worse than not having it.
Three rules keep the list short:

* **State transitions are always reported.** A claim that held last week and
  does not hold today is the single most valuable line this platform can
  produce, whatever the kind.
* **Numbers need a threshold.** Per-kind, because 5% is noise for a 24h volume
  and alarming for a total supply.
* **Pure churn is dropped entirely.** Block heights and transfer counts change
  by definition; reporting them is padding.
"""

from __future__ import annotations

import asyncio
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING, Any, Final

from app.logging import get_logger
from app.models.enums import EvidenceState

if TYPE_CHECKING:  # pragma: no cover - avoids a context ↔ changes import cycle
    from app.engine.context import ExecutionContext

logger = get_logger(__name__)

#: Kinds that move on their own every block. A diff on these is noise.
IGNORED_KINDS: Final[frozenset[str]] = frozenset(
    {
        "transfers",
        "blocks",
        "transactions",
        "throughput",
        "addresses",
        "head",
        "nonce",
        "activity",
        "block_time",
        "gas",
        "tokens",
        "chain",
        "archive_span",
        "certificates",
    }
)

#: Relative move that counts as material, per kind. A 50% swing in 24h volume
#: is a normal day; a 10% move in market cap is not.
RELATIVE_THRESHOLDS: Final[dict[str, float]] = {
    "price": 0.10,
    "market_cap": 0.10,
    "volume": 0.50,
    "holders": 0.05,
    "balance": 0.05,
    "balance_usd": 0.10,
    "holdings": 0.0,
    "portfolio": 0.0,
    "portfolio_screened": 0.0,
    #: Any movement at all. Supply is meant to be fixed; a change is a mint or
    #: a burn, which is exactly what a holder needs told.
    "supply": 0.0,
}
DEFAULT_RELATIVE_THRESHOLD: Final = 0.10

#: Kinds already expressed as a percentage, compared in percentage points.
ABSOLUTE_THRESHOLDS: Final[dict[str, float]] = {
    "concentration": 1.0,
    "deployer_holding": 1.0,
    "buy_tax": 0.5,
    "sell_tax": 0.5,
    "risk_score": 5.0,
}

#: Kinds where a value first appearing or vanishing is itself the news.
WATCHED_KINDS: Final[frozenset[str]] = frozenset(
    {
        "tradability",
        "declared_website",
        "declared_website_resolves",
        "holding_flagged",
        "holding_unscored",
        "deployer_holding",
        "hidden_owner",
        "reclaimable_ownership",
        "pausable",
        "verification",
        "proxy",
    }
)

ALARMING: Final = "alarming"
NOTABLE: Final = "notable"
INFORMATIONAL: Final = "informational"

_SEVERITY_ORDER: Final[dict[str, int]] = {ALARMING: 0, NOTABLE: 1, INFORMATIONAL: 2}


@dataclass(slots=True)
class Change:
    """One difference between this run and the previous one."""

    kind: str
    label: str
    direction: str
    severity: str
    detail: str
    before: Any = None
    after: Any = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "label": self.label,
            "direction": self.direction,
            "severity": self.severity,
            "detail": self.detail,
            "before": self.before,
            "after": self.after,
        }


def _restates_a_refutation(kind: str) -> bool:
    """Whether this row is a second telling of a contradiction already reported.

    The Risk Agent turns every refuted finding into a `risk_signal:refuted:*`
    row, so a single broken claim reaches the diff twice — once as the claim
    and once as the signal derived from it. Verified against two stored VIRTUAL
    runs, where one ticker-reuse finding produced three near-identical lines.
    The claim itself is the one worth keeping; it carries the reason.
    """
    return kind.startswith("risk_signal:refuted:")


def _key(item: dict[str, Any]) -> tuple[str, str]:
    """Kind alone is not unique — a portfolio emits one row per holding."""
    return str(item.get("kind") or ""), str(item.get("label") or "")


def _state(item: dict[str, Any]) -> str:
    raw = item.get("state")
    return str(raw) if raw else EvidenceState.CONFIRMED.value


def _numeric(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int | float):
        return float(value)
    return None


def _fmt(value: Any) -> str:
    if isinstance(value, float):
        return f"{value:,.4f}".rstrip("0").rstrip(".")
    if isinstance(value, int):
        return f"{value:,}"
    return str(value)


def compare(
    current: Iterable[dict[str, Any]], previous: Iterable[dict[str, Any]]
) -> list[Change]:
    """Diff two evidence lists, keeping only what a reader would act on."""
    now = {_key(item): item for item in current if item.get("kind")}
    before = {_key(item): item for item in previous if item.get("kind")}

    changes: list[Change] = []

    for key, item in now.items():
        kind = key[0]
        if kind in IGNORED_KINDS or _restates_a_refutation(kind):
            continue

        earlier = before.get(key)
        change = _appeared(item) if earlier is None else _compare_one(item, earlier)

        if change is not None:
            changes.append(change)

    for key, item in before.items():
        if key[0] in IGNORED_KINDS or key in now or _restates_a_refutation(key[0]):
            continue
        change = _disappeared(item)
        if change is not None:
            changes.append(change)

    changes.sort(key=lambda item: (_SEVERITY_ORDER.get(item.severity, 3), item.label))
    return changes


def _compare_one(item: dict[str, Any], earlier: dict[str, Any]) -> Change | None:
    label = str(item.get("label") or item.get("kind"))
    kind = str(item.get("kind"))

    state_now, state_before = _state(item), _state(earlier)
    if state_now != state_before:
        return _state_change(kind, label, item, state_before, state_now)

    return _value_change(kind, label, earlier.get("value"), item.get("value"))


def _state_change(
    kind: str,
    label: str,
    item: dict[str, Any],
    before: str,
    after: str,
) -> Change:
    """A claim's standing moved. Always reported, whatever the kind."""
    refuted = EvidenceState.REFUTED.value
    unknown = EvidenceState.UNKNOWN.value

    if after == refuted:
        return Change(
            kind=kind,
            label=label,
            direction="broke",
            severity=ALARMING,
            detail=(
                item.get("reason")
                or f"{label} held at the last check and does not hold now."
            ),
            before=before,
            after=after,
        )

    if before == refuted:
        return Change(
            kind=kind,
            label=label,
            direction="recovered",
            severity=NOTABLE,
            detail=f"{label} did not hold at the last check and holds now.",
            before=before,
            after=after,
        )

    if after == unknown:
        return Change(
            kind=kind,
            label=label,
            direction="lost",
            severity=NOTABLE,
            # Losing sight of something is not the same as it being fine, and
            # without this line it would look identical to it.
            detail=(
                f"{label} could be checked at the last run and could not this "
                f"time: {item.get('reason') or 'no reason given'}"
            ),
            before=before,
            after=after,
        )

    return Change(
        kind=kind,
        label=label,
        direction="restored",
        severity=INFORMATIONAL,
        detail=f"{label} could not be checked last time and was checked now.",
        before=before,
        after=after,
    )


def _value_change(kind: str, label: str, before: Any, after: Any) -> Change | None:
    if before == after:
        return None

    left, right = _numeric(before), _numeric(after)

    if left is not None and right is not None:
        if not _is_material(kind, left, right):
            return None
        return Change(
            kind=kind,
            label=label,
            direction="rose" if right > left else "fell",
            severity=_numeric_severity(kind, left, right),
            detail=f"{label} moved from {_fmt(before)} to {_fmt(after)}.",
            before=before,
            after=after,
        )

    if before is None or after is None:
        # One side missing with the state unchanged means an optional field
        # came or went. Too weak to report on its own.
        return None

    return Change(
        kind=kind,
        label=label,
        direction="changed",
        severity=NOTABLE if isinstance(after, bool) else INFORMATIONAL,
        detail=f"{label} changed from {_fmt(before)} to {_fmt(after)}.",
        before=before,
        after=after,
    )


def _is_material(kind: str, before: float, after: float) -> bool:
    absolute = ABSOLUTE_THRESHOLDS.get(kind)
    if absolute is not None:
        return abs(after - before) >= absolute

    threshold = RELATIVE_THRESHOLDS.get(kind, DEFAULT_RELATIVE_THRESHOLD)
    if threshold <= 0:
        return True
    if before == 0:
        # Zero to anything is a real event (first volume, first holder); the
        # relative test cannot express it.
        return after != 0
    return abs(after - before) / abs(before) >= threshold


def _numeric_severity(kind: str, before: float, after: float) -> str:
    rose = after > before
    if kind == "risk_score":
        return ALARMING if not rose else NOTABLE
    if kind == "supply":
        # New supply appearing is a mint. Nothing else in a diff matters more.
        return ALARMING if rose else NOTABLE
    if kind in ("concentration", "deployer_holding") and rose:
        return NOTABLE
    if kind in ("holders", "holdings") and not rose:
        return NOTABLE
    return INFORMATIONAL


def _appeared(item: dict[str, Any]) -> Change | None:
    kind = str(item.get("kind"))
    label = str(item.get("label") or kind)
    state = _state(item)

    if state == EvidenceState.REFUTED.value:
        return Change(
            kind=kind,
            label=label,
            direction="broke",
            severity=ALARMING,
            detail=(
                item.get("reason")
                or f"{label} does not hold, and was not checked before."
            ),
            after=state,
        )

    if kind.startswith("risk_signal:"):
        return Change(
            kind=kind,
            label=label,
            direction="appeared",
            severity=ALARMING,
            detail=f"New risk signal: {label}",
            after=item.get("value"),
        )

    if kind in WATCHED_KINDS:
        return Change(
            kind=kind,
            label=label,
            direction="appeared",
            severity=NOTABLE,
            detail=f"{label} is reported for the first time: {_fmt(item.get('value'))}",
            after=item.get("value"),
        )

    # Everything else appearing is usually just wider coverage than last time,
    # not news about the subject.
    return None


def _disappeared(item: dict[str, Any]) -> Change | None:
    kind = str(item.get("kind"))
    label = str(item.get("label") or kind)

    if kind.startswith("risk_signal:"):
        return Change(
            kind=kind,
            label=label,
            direction="cleared",
            severity=NOTABLE,
            detail=f"Risk signal no longer fires: {label}",
            before=item.get("value"),
        )

    if _state(item) == EvidenceState.REFUTED.value:
        return Change(
            kind=kind,
            label=label,
            direction="cleared",
            severity=NOTABLE,
            detail=f"{label} was contradicted at the last check and is not reported now.",
            before=item.get("value"),
        )

    return None


def build_report(
    changes: list[Change],
    *,
    previous_id: str,
    previous_at: datetime,
    compared_at: datetime,
) -> dict[str, Any]:
    """The `facts["changes"]` payload, shaped for the console and the summary."""
    elapsed = compared_at - previous_at
    return {
        "previous_execution_id": previous_id,
        "previous_at": previous_at.isoformat(),
        "elapsed_seconds": max(0, int(elapsed.total_seconds())),
        "total": len(changes),
        "alarming": sum(1 for item in changes if item.severity == ALARMING),
        "items": [item.to_dict() for item in changes],
    }


async def detect_changes(context: ExecutionContext) -> dict[str, Any] | None:
    """Load the previous run of this subject and diff against it.

    Returns None when there is nothing to compare to — a first analysis, a
    subject with no address, or a lookback window of zero. That is not a
    failure and must not read as "no changes"; the caller distinguishes them.

    Every failure here is swallowed. A comparison is an enrichment, and losing
    it must never cost the reader the analysis that did succeed.
    """
    # Imported inside the call: the repository imports engine result types, and
    # a module-level import would close that loop.
    from app.config import get_settings
    from app.models.base import utcnow
    from app.repositories import get_execution_store

    if context.routing is None:
        return None

    lookback = get_settings().change_lookback_days * 86_400
    if lookback <= 0:
        return None

    try:
        previous = await asyncio.to_thread(
            get_execution_store().find_previous,
            context.routing.target.value,
            context.routing.address,
            exclude_id=context.execution_id,
            max_age_seconds=lookback,
            owner_key_id=context.owner_key_id,
        )
    except Exception as exc:
        logger.warning("change_lookup_failed", error=str(exc))
        return None

    if previous is None:
        return None

    changes = compare([item.to_dict() for item in context.evidence], previous.evidence)
    return build_report(
        changes,
        previous_id=previous.execution_id,
        previous_at=previous.created_at,
        compared_at=utcnow(),
    )
