"""Turning an execution into a report and the artifacts that carry it.

One builder, used by every analysis. A token report and a website report differ
in their findings, not in their shape — so a reader who has read one can read
any of them, and a new agent inherits the whole presentation for free.

The section list is fixed and the *contents* are derived. A section with
nothing to say is omitted rather than rendered empty, with one deliberate
exception: `Warnings` and `Not established` are printed even when they are
empty, because "we checked and found nothing to warn about" and "we did not
look" are the two things this platform exists to keep apart.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.engine.artifacts import (
    Artifact,
    bundle,
    csv_table,
    json_document,
    markdown_report,
)

#: Findings this many or fewer are listed in full in the summary section;
#: beyond it the section counts them and points at the evidence table.
_INLINE_FINDING_LIMIT = 12


@dataclass(frozen=True, slots=True)
class Report:
    title: str
    sections: list[tuple[str, str]]
    artifacts: list[Artifact]

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "sections": [{"heading": h, "body": b} for h, b in self.sections],
            "artifacts": [a.to_dict() for a in self.artifacts],
        }


def build_report(execution: dict[str, Any]) -> Report:
    """Assemble every section and artifact for one finished execution."""
    evidence: list[dict[str, Any]] = list(execution.get("evidence") or [])
    facts: dict[str, Any] = dict(execution.get("facts") or {})
    sources: list[dict[str, Any]] = list(execution.get("sources") or [])
    stages: list[dict[str, Any]] = list(execution.get("stages") or [])

    confirmed = [item for item in evidence if item.get("state") == "confirmed"]
    refuted = [item for item in evidence if item.get("state") == "refuted"]
    unknown = [item for item in evidence if item.get("state") == "unknown"]

    title = _title(execution)
    sections: list[tuple[str, str]] = []

    def add(heading: str, body: str, *, always: bool = False) -> None:
        if body.strip() or always:
            sections.append((heading, body.strip() or "_Nothing to report._"))

    add("Executive summary", _executive_summary(execution, facts, evidence))
    add("Findings", _findings(confirmed, refuted))
    # Always printed. An empty warnings section is a statement; a missing one
    # is ambiguous between "clean" and "never assessed".
    add("Warnings", _warnings(refuted, facts), always=True)
    add("Not established", _unknowns(unknown), always=True)
    add("Recommendations", _recommendations(unknown, refuted, facts))
    add("Confidence", _confidence(evidence, stages))
    add("Timeline", _timeline(stages))
    add("Performance", _performance(execution, stages))
    add("Sources", _sources(sources))

    artifacts = _artifacts(execution, title, sections, evidence, sources)
    return Report(title=title, sections=sections, artifacts=artifacts)


# --- Sections ---------------------------------------------------------------


def _title(execution: dict[str, Any]) -> str:
    target = execution.get("target") or "Analysis"
    address = execution.get("address")
    if address:
        return f"{str(target).title()} {address[:10]}…{address[-4:]}"
    return str(target).title()


def _executive_summary(
    execution: dict[str, Any], facts: dict[str, Any], evidence: list[dict[str, Any]]
) -> str:
    lines: list[str] = []

    risk = facts.get("risk")
    if isinstance(risk, dict) and risk.get("score") is not None:
        # The scale runs the other way to intuition, so the level is never
        # separated from the number.
        lines.append(
            f"Risk score **{risk['score']}/100 ({risk.get('level')})** — "
            "higher is safer."
        )
    elif evidence:
        lines.append("No risk score was produced for this subject.")

    counts = {
        state: sum(1 for item in evidence if item.get("state") == state)
        for state in ("confirmed", "refuted", "unknown")
    }
    lines.append(
        f"{len(evidence)} finding(s): {counts['confirmed']} confirmed, "
        f"{counts['refuted']} refuted, {counts['unknown']} not established."
    )

    if counts["unknown"]:
        lines.append(
            f"**{counts['unknown']} check(s) could not run.** Any score above is a "
            "ceiling — the real figure can only be lower."
        )

    summary = execution.get("summary")
    status = execution.get("summary_status")
    if summary:
        lines.append(f"\n{summary}")
    elif status and status != "generated":
        lines.append(f"\n_No written summary: {status.replace('_', ' ')}._")

    return "\n\n".join(lines)


def _findings(confirmed: list[dict[str, Any]], refuted: list[dict[str, Any]]) -> str:
    established = confirmed + refuted
    if not established:
        return ""

    if len(established) > _INLINE_FINDING_LIMIT:
        return (
            f"{len(confirmed)} confirmed and {len(refuted)} refuted finding(s). "
            "The full list is in `evidence.csv`."
        )

    lines: list[str] = []
    for item in established:
        mark = "✓" if item.get("state") == "confirmed" else "✗"
        value = item.get("value")
        rendered = f" — `{value}`" if value not in (None, "", [], {}) else ""
        lines.append(f"- {mark} {item.get('label')}{rendered}")
    return "\n".join(lines)


def _warnings(refuted: list[dict[str, Any]], facts: dict[str, Any]) -> str:
    lines: list[str] = []

    risk = facts.get("risk")
    if isinstance(risk, dict):
        for signal in risk.get("signals") or []:
            if not isinstance(signal, dict):
                continue
            lines.append(
                f"- **{signal.get('severity', 'unknown')}** — {signal.get('detail')}"
            )

    for item in refuted:
        lines.append(f"- A claim did not hold: {item.get('label')}")

    changes = facts.get("changes")
    if isinstance(changes, dict) and changes.get("alarming"):
        lines.append(
            f"- **{changes['alarming']} alarming change(s)** since the previous run."
        )

    return "\n".join(lines) or "No warnings were raised by the checks that ran."


def _unknowns(unknown: list[dict[str, Any]]) -> str:
    if not unknown:
        return "Every check that was attempted returned a result."

    lines = ["These checks could not run. They are **not** negative results.", ""]
    for item in unknown:
        reason = item.get("reason") or "No reason recorded."
        lines.append(f"- {item.get('label')} — {reason}")
    return "\n".join(lines)


def _recommendations(
    unknown: list[dict[str, Any]], refuted: list[dict[str, Any]], facts: dict[str, Any]
) -> str:
    """What a reader could do next, derived from what actually happened.

    Only from evidence — never generic advice. A recommendation nobody's data
    produced is filler, and filler in a security report is worse than silence.
    """
    lines: list[str] = []

    if unknown:
        lines.append(
            f"- Re-run later: {len(unknown)} check(s) could not complete, and a "
            "second attempt often resolves an unavailable source."
        )

    risk = facts.get("risk")
    if (
        isinstance(risk, dict)
        and isinstance(risk.get("score"), int)
        and risk["score"] < 60
    ):
        lines.append(
            "- Treat this subject as unresolved until the warnings above are "
            "addressed — the score is below the moderate threshold."
        )

    if refuted:
        lines.append(
            "- Review each refuted claim: something asserted about this subject "
            "does not hold."
        )

    changes = facts.get("changes")
    if isinstance(changes, dict) and changes.get("alarming"):
        lines.append("- Compare against the previous run before acting on this one.")

    portfolio = facts.get("portfolio")
    if isinstance(portfolio, dict) and portfolio.get("skipped"):
        lines.append(
            f"- {len(portfolio['skipped'])} position(s) were not screened. "
            "Analyse them individually for full coverage."
        )

    return "\n".join(lines)


def _confidence(evidence: list[dict[str, Any]], stages: list[dict[str, Any]]) -> str:
    if not evidence:
        return "**unknown** — nothing was established, so there is no basis to rate."

    established = sum(1 for item in evidence if item.get("state") != "unknown")
    ratio = established / len(evidence)
    failed = [stage for stage in stages if stage.get("success") is False]

    if ratio >= 0.9 and not failed:
        level = "high"
    elif ratio >= 0.6:
        level = "moderate"
    else:
        level = "low"

    detail = f"**{level}** — {established} of {len(evidence)} checks completed."
    if failed:
        detail += f" {len(failed)} stage(s) failed."
    return detail


def _timeline(stages: list[dict[str, Any]]) -> str:
    if not stages:
        return ""
    lines = []
    for stage in stages:
        mark = "✓" if stage.get("success") else "✗"
        duration = stage.get("duration_ms")
        timing = f" · {duration} ms" if duration is not None else ""
        note = f" — {stage['error']}" if stage.get("error") else ""
        lines.append(f"- {mark} {stage.get('stage')}{timing}{note}")
    return "\n".join(lines)


def _performance(execution: dict[str, Any], stages: list[dict[str, Any]]) -> str:
    total = execution.get("execution_time_ms")
    if total is None:
        return ""

    lines = [f"Total **{total} ms**."]
    timed = [s for s in stages if isinstance(s.get("duration_ms"), int)]
    if timed:
        slowest = max(timed, key=lambda s: s["duration_ms"])
        share = round(slowest["duration_ms"] / total * 100) if total else 0
        lines.append(
            f"Slowest stage: `{slowest.get('stage')}` at {slowest['duration_ms']} ms "
            f"({share}% of the run)."
        )
    return "\n".join(lines)


def _sources(sources: list[dict[str, Any]]) -> str:
    if not sources:
        return ""
    # Vendor names never reach a report: a source is named by what it is.
    return "\n".join(
        f"- [{item.get('label') or item.get('url')}]({item.get('url')})"
        for item in sources
        if item.get("url")
    )


# --- Artifacts --------------------------------------------------------------


def _artifacts(
    execution: dict[str, Any],
    title: str,
    sections: list[tuple[str, str]],
    evidence: list[dict[str, Any]],
    sources: list[dict[str, Any]],
) -> list[Artifact]:
    """Every downloadable form of this execution, plus a bundle of all of them."""
    execution_id = execution.get("execution_id")
    produced: list[Artifact] = [
        markdown_report(title, sections, execution_id=execution_id),
    ]

    if evidence:
        produced.append(
            csv_table(
                "evidence",
                [
                    {
                        "label": item.get("label"),
                        "state": item.get("state"),
                        "value": item.get("value"),
                        "reason": item.get("reason"),
                        "source_url": item.get("source_url"),
                    }
                    for item in evidence
                ],
                label="Evidence",
                description="Every finding with its state and source.",
                execution_id=execution_id,
            )
        )

    if sources:
        produced.append(
            csv_table(
                "sources",
                [{"label": s.get("label"), "url": s.get("url")} for s in sources],
                label="Sources",
                description="Every place this run read from.",
                execution_id=execution_id,
            )
        )

    produced.append(
        json_document(
            "execution",
            execution,
            label="Raw output",
            description="The complete response, unmodified.",
            execution_id=execution_id,
        )
    )

    # The bundle is built last and never includes itself.
    produced.append(bundle(produced, execution_id=execution_id))
    return produced
