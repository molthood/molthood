"""What the public feed is allowed to say about an execution.

Two rules shape every field here, and both are subtractive.

**Nothing identifies the subject.** An execution records the address somebody
asked about. Publishing that would undo the reason history is scoped per key
in the first place, so the feed carries the *kind* of subject and never the
subject itself.

**Nothing names a provider.** A reader learns that information was collected,
not that Blockscout or Exa collected it. Vendor names are an implementation
detail, they change, and a public page that lists them turns every supplier
switch into a visible product change.

The mapping below is therefore one-way on purpose: it is built by dropping
fields from the internal record, never by assembling a view that happens to
omit them. A field added upstream cannot leak by accident because nothing here
copies unknown keys.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from app.schemas.common import SchemaBase

#: Internal pipeline stage → the phase a reader understands.
#:
#: Deliberately not the enum's own names. `engine` and `evidence` describe how
#: this codebase is built; "Collecting information" describes what is
#: happening to the thing the reader asked about.
STAGE_LABELS: dict[str, str] = {
    "input": "Initializing execution",
    "agents": "Preparing workspace",
    "engine": "Collecting information",
    "evidence": "Validating findings",
    "report": "Generating insights",
}

#: The order a run moves through, so the UI can show what is still ahead
#: rather than only what has happened.
STAGE_ORDER: tuple[str, ...] = ("input", "agents", "engine", "evidence", "report")

#: What each kind of subject is called publicly. A subject type that is not in
#: this map is reported as "Analysis" rather than passed through — an unmapped
#: value is exactly how an internal name escapes.
SUBJECT_LABELS: dict[str, str] = {
    "token": "Token analysis",
    "wallet": "Wallet analysis",
    "contract": "Contract analysis",
    "project": "Network overview",
    "site": "Website analysis",
}

PublicStatus = Literal["running", "completed", "failed"]


class PublicStep(SchemaBase):
    """One phase of a run, as a reader sees it."""

    label: str = Field(description="What was happening, in plain language.")
    state: Literal["completed", "running", "waiting", "failed"]
    duration_ms: int | None = None


class PublicExecution(SchemaBase):
    """One published execution.

    Everything a viewer needs to follow progress, and nothing that identifies
    the subject or the suppliers.
    """

    id: str
    kind: str = Field(description="The sort of work, e.g. 'Token analysis'.")
    status: PublicStatus
    current_step: str = Field(description="The phase it is in, or finished on.")

    steps: list[PublicStep] = Field(default_factory=list)
    progress: float = Field(ge=0.0, le=1.0, description="0 to 1 across the phases.")

    started_at: datetime
    elapsed_ms: int | None = None

    findings: int = Field(default=0, description="How many facts were recorded.")
    sources: int = Field(default=0, description="How many independent sources.")
    artifacts: int = 0
    has_report: bool = False


def to_public(row: Any) -> PublicExecution:
    """Build the public view by *selecting* fields, never by copying a record.

    Written as an explicit construction so that adding a column upstream can
    never widen what is published. Anything not named here does not appear.
    """
    status = _status(str(getattr(row, "status", "")))
    stages = _stages(row)
    completed = sum(1 for step in stages if step.state == "completed")

    return PublicExecution(
        id=row.id,
        kind=SUBJECT_LABELS.get(row.target or "", "Analysis"),
        status=status,
        current_step=_current(stages, status),
        steps=stages,
        progress=round(completed / len(STAGE_ORDER), 3) if stages else 0.0,
        started_at=row.created_at,
        elapsed_ms=row.duration_ms,
        findings=len(row.evidence or []),
        sources=len(row.sources or []),
        artifacts=0,
        has_report=bool(row.summary),
    )


def _status(raw: str) -> PublicStatus:
    value = raw.lower()
    if value in ("succeeded", "completed"):
        return "completed"
    if value in ("failed", "cancelled"):
        return "failed"
    return "running"


def _stages(row: Any) -> list[PublicStep]:
    """The phase list, with anything unfinished marked as waiting.

    Built from the stored trace rather than assumed, so a run that stopped
    early shows the phases it never reached instead of implying it did.
    """
    recorded: dict[str, dict[str, Any]] = {}
    for entry in row.stages or []:
        if isinstance(entry, dict) and entry.get("stage"):
            recorded[str(entry["stage"])] = entry

    steps: list[PublicStep] = []
    for stage in STAGE_ORDER:
        entry = recorded.get(stage)

        if entry is None:
            state: Literal["completed", "running", "waiting", "failed"] = "waiting"
            duration = None
        elif entry.get("success"):
            state, duration = "completed", entry.get("duration_ms")
        else:
            state, duration = "failed", entry.get("duration_ms")

        steps.append(
            PublicStep(
                label=STAGE_LABELS.get(stage, "Working"),
                state=state,
                duration_ms=duration if isinstance(duration, int) else None,
            )
        )

    return steps


def _current(steps: list[PublicStep], status: PublicStatus) -> str:
    if status == "completed":
        return "Completed"
    for step in steps:
        if step.state in ("running", "waiting"):
            return step.label
        if step.state == "failed":
            return f"Stopped at {step.label.lower()}"
    return "Finalizing execution"
