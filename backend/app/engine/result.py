"""Results returned by agents and by the engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.models.enums import EvidenceState, ExecutionStatus, PipelineStage


@dataclass(frozen=True, slots=True)
class Finding:
    """One thing an agent established, and how firmly.

    This replaced a bare `(kind, label, value, source_url)` tuple. The tuple
    had no way to distinguish "checked, the answer is no" from "the lookup
    failed", so the evidence stage dropped both by testing `value is not
    None`. Three real bugs traced back to that single line.

    Build these through the constructors below rather than directly — they
    enforce the invariant that an unknown always carries a reason.
    """

    kind: str
    label: str
    value: Any = None
    source_url: str | None = None
    state: EvidenceState = EvidenceState.CONFIRMED
    #: Why the check could not be made. Required for UNKNOWN, unused otherwise.
    reason: str | None = None

    @classmethod
    def confirmed(
        cls, kind: str, label: str, value: Any, source_url: str | None = None
    ) -> Finding:
        """Checked, and this is the answer.

        A `False` or `0` here is a real measurement and is kept. A `None` means
        the agent had nothing to report and the finding is dropped.
        """
        return cls(kind=kind, label=label, value=value, source_url=source_url)

    @classmethod
    def refuted(
        cls,
        kind: str,
        label: str,
        value: Any = None,
        source_url: str | None = None,
        reason: str | None = None,
    ) -> Finding:
        """Checked a claim the subject makes about itself; it does not hold."""
        return cls(
            kind=kind,
            label=label,
            value=value,
            source_url=source_url,
            state=EvidenceState.REFUTED,
            reason=reason,
        )

    @classmethod
    def unknown(
        cls, kind: str, label: str, reason: str, source_url: str | None = None
    ) -> Finding:
        """Could not be checked. Surfaced rather than silently omitted."""
        return cls(
            kind=kind,
            label=label,
            source_url=source_url,
            state=EvidenceState.UNKNOWN,
            reason=reason,
        )


@dataclass(slots=True)
class AgentResult:
    """What an agent hands back after handling a task."""

    success: bool
    output: dict[str, Any] = field(default_factory=dict)
    summary: str = ""
    error: str | None = None
    evidence: list[Finding] = field(default_factory=list)

    @classmethod
    def ok(
        cls,
        summary: str = "",
        output: dict[str, Any] | None = None,
        evidence: list[Finding] | None = None,
    ) -> AgentResult:
        return cls(
            success=True,
            summary=summary,
            output=output or {},
            evidence=evidence or [],
        )

    @classmethod
    def failure(cls, error: str, output: dict[str, Any] | None = None) -> AgentResult:
        return cls(success=False, error=error, output=output or {})


@dataclass(slots=True)
class StageResult:
    """What a pipeline stage hands back."""

    stage: PipelineStage
    success: bool
    summary: str = ""
    error: str | None = None
    duration_ms: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "stage": self.stage.value,
            "success": self.success,
            "summary": self.summary,
            "error": self.error,
            "duration_ms": self.duration_ms,
        }


@dataclass(slots=True)
class ExecutionResult:
    """The terminal outcome of a run — the platform's standard response object."""

    execution_id: str
    status: ExecutionStatus
    stage: PipelineStage
    target: str | None = None
    address: str | None = None
    #: The API key that ran this, so history can be scoped to its owner.
    owner_key_id: str | None = None
    agents_used: list[str] = field(default_factory=list)
    services_called: list[str] = field(default_factory=list)

    #: AI-generated prose. Kept strictly separate from `evidence`.
    summary: str | None = None
    summary_status: str = "pending"
    summary_detail: str | None = None
    summary_model: str | None = None

    #: Raw, service-derived facts. Never AI-generated.
    facts: dict[str, Any] = field(default_factory=dict)
    evidence: list[dict[str, Any]] = field(default_factory=list)
    sources: list[dict[str, str]] = field(default_factory=list)

    tasks: list[dict[str, Any]] = field(default_factory=list)
    stages: list[StageResult] = field(default_factory=list)
    execution_time_ms: int | None = None
    error: str | None = None

    @property
    def succeeded(self) -> bool:
        return self.status is ExecutionStatus.SUCCEEDED
