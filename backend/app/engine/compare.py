"""Comparing two subjects.

Distinct from `engine/changes.py`, and the distinction matters. That module
compares one subject to **its own past** — what moved since last time. This one
compares **two different subjects** at the same moment: token A against token B,
one site against another.

The hard part is not the diff. It is refusing to imply more than the data
supports, and there are two ways to get that wrong:

- **Comparing on a check only one side ran.** If A was screened for sellability
  and B was not, "A is safer" is unfounded — the difference is in the coverage,
  not the subject. Those checks are reported as *not comparable* rather than
  scored.
- **Ranking on totals of different sizes.** A subject with twenty findings and
  one with four are not two measurements of the same thing, and a winner
  declared across them is arithmetic rather than judgement.

So a comparison names what is genuinely shared, says plainly what is not, and
declines to pick a winner when the basis is too thin.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.engine.labels import describe_source

#: Below this many shared checks, a verdict is withheld. Two subjects agreeing
#: on three things is not a comparison, it is a coincidence.
MIN_SHARED_CHECKS = 4


@dataclass(frozen=True, slots=True)
class Side:
    """One subject, reduced to what a comparison needs."""

    execution_id: str | None
    label: str
    target: str | None
    address: str | None
    score: int | None
    level: str | None
    findings: dict[str, dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        return {
            "execution_id": self.execution_id,
            "label": self.label,
            "target": self.target,
            "address": self.address,
            "score": self.score,
            "level": self.level,
            "checks": len(self.findings),
        }


@dataclass(slots=True)
class Comparison:
    left: Side
    right: Side
    #: Checks both sides ran, with each verdict.
    shared: list[dict[str, Any]] = field(default_factory=list)
    #: Checks only one side ran. Never scored — see the module docstring.
    not_comparable: list[dict[str, Any]] = field(default_factory=list)
    verdict: str | None = None
    verdict_reason: str = ""
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "left": self.left.to_dict(),
            "right": self.right.to_dict(),
            "shared": self.shared,
            "not_comparable": self.not_comparable,
            "shared_checks": len(self.shared),
            "verdict": self.verdict,
            "verdict_reason": self.verdict_reason,
            "warnings": self.warnings,
        }


def _clean(value: Any) -> Any:
    """Strip a supplier name from a value without disturbing anything else."""
    return describe_source(value) if isinstance(value, str) else value


def side_from(execution: dict[str, Any]) -> Side:
    """Reduce one execution to a comparable side.

    Findings are keyed by `kind` rather than by label. A label is prose and
    changes with wording; `kind` is the identifier the agent assigned, so two
    runs of different agents still line up on the same check.
    """
    facts = execution.get("facts") or {}
    risk = facts.get("risk") if isinstance(facts, dict) else None

    findings: dict[str, dict[str, Any]] = {}
    for item in execution.get("evidence") or []:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("kind") or item.get("label") or "")
        if kind:
            findings[kind] = item

    address = execution.get("address")
    target = execution.get("target")
    label = f"{target or 'Subject'}"
    if isinstance(address, str) and len(address) > 14:
        label = f"{label} {address[:8]}…{address[-4:]}"

    return Side(
        execution_id=execution.get("execution_id"),
        label=label,
        target=target if isinstance(target, str) else None,
        address=address if isinstance(address, str) else None,
        score=risk.get("score") if isinstance(risk, dict) else None,
        level=risk.get("level") if isinstance(risk, dict) else None,
        findings=findings,
    )


def compare(
    left_execution: dict[str, Any], right_execution: dict[str, Any]
) -> Comparison:
    """Compare two executions of different subjects."""
    left = side_from(left_execution)
    right = side_from(right_execution)
    result = Comparison(left=left, right=right)

    if left.target and right.target and left.target != right.target:
        result.warnings.append(
            f"Comparing a {left.target} with a {right.target}. They are checked "
            "differently, so most findings will not line up."
        )

    every = sorted(set(left.findings) | set(right.findings))

    for kind in every:
        a = left.findings.get(kind)
        b = right.findings.get(kind)

        if a is None or b is None:
            present = a or b
            result.not_comparable.append(
                {
                    "kind": kind,
                    "label": describe_source(str((present or {}).get("label") or kind)),
                    "ran_on": "left" if a is not None else "right",
                    # Named explicitly: a reader must not read a one-sided check
                    # as a difference between the subjects.
                    "reason": "Only one side ran this check.",
                }
            )
            continue

        # Both ran it, but a check that could not complete establishes nothing.
        # Treating `unknown` as a value would manufacture a difference out of
        # two absences.
        if a.get("state") == "unknown" or b.get("state") == "unknown":
            result.not_comparable.append(
                {
                    "kind": kind,
                    "label": describe_source(str(a.get("label") or kind)),
                    "ran_on": "both",
                    "reason": "At least one side could not establish a result.",
                }
            )
            continue

        result.shared.append(
            {
                "kind": kind,
                "label": describe_source(str(a.get("label") or kind)),
                # Values are redacted too. An agent had written
                # "0.0% (GoPlus: 0.0%)" into one, so a supplier reached the
                # reader through the data rather than through a label.
                "left": {"state": a.get("state"), "value": _clean(a.get("value"))},
                "right": {"state": b.get("state"), "value": _clean(b.get("value"))},
                "agrees": a.get("state") == b.get("state")
                and a.get("value") == b.get("value"),
            }
        )

    _decide(result)
    return result


def _decide(result: Comparison) -> None:
    """Pick a side, or say why none was picked.

    A verdict needs a real basis: enough shared checks, and scores that both
    exist. Anything less returns `None`, which the console renders as "not
    enough in common" rather than as a tie — a tie is a finding, and this is
    not one.
    """
    shared = len(result.shared)

    if shared < MIN_SHARED_CHECKS:
        result.verdict = None
        result.verdict_reason = (
            f"Only {shared} check(s) ran on both sides. That is not enough to "
            "compare them — see what is listed as not comparable."
        )
        return

    left, right = result.left, result.right

    if left.score is None or right.score is None:
        missing = left.label if left.score is None else right.label
        result.verdict = None
        result.verdict_reason = (
            f"No score was produced for {missing}, so the two cannot be ranked. "
            f"The {shared} shared check(s) are still listed."
        )
        return

    if left.score == right.score:
        result.verdict = "tie"
        result.verdict_reason = (
            f"Both score {left.score}/100 across {shared} shared check(s)."
        )
        return

    winner = left if left.score > right.score else right
    loser = right if winner is left else left
    result.verdict = "left" if winner is left else "right"
    # Higher is safer, and the sentence says so — the number alone reads
    # backwards to anyone meeting this scale for the first time.
    result.verdict_reason = (
        f"{winner.label} scores {winner.score}/100 against "
        f"{loser.score}/100 for {loser.label} — higher is safer — "
        f"across {shared} shared check(s)."
    )

    if result.not_comparable:
        result.warnings.append(
            f"{len(result.not_comparable)} check(s) ran on only one side or "
            "could not complete. The verdict does not account for them."
        )
