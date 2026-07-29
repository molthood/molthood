"""The report a task returns.

Shaped so a reader can always answer two questions: *what was found*, and
*where did it come from*. Every claim-bearing section carries provenance, and
the sections that record how the work was done — the timelines, the skipped
steps — are part of the report rather than debug output, because a report that
hides which steps did not run cannot be checked.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from app.schemas.common import SchemaBase

#: How much weight a reader should put on a section.
Confidence = Literal["high", "medium", "low", "unknown"]


class Citation(SchemaBase):
    """Where one claim came from."""

    url: str | None = Field(default=None, description="The page this came from.")
    title: str | None = None
    published_at: str | None = None
    provider: str = Field(description="Which provider retrieved it.")
    #: The passage the claim rests on, where the provider returned one.
    excerpt: str | None = None


class EvidenceItem(SchemaBase):
    """One thing established, and how firmly.

    Mirrors the on-chain evidence model deliberately: `confirmed`, `refuted`,
    and `unknown` mean the same things here, and a check that could not run
    must never render as one that came back clean.
    """

    kind: str
    label: str
    value: Any = None
    state: Literal["confirmed", "refuted", "unknown"] = "confirmed"
    reason: str | None = Field(
        default=None, description="Why a check was refuted or could not run."
    )
    citations: list[Citation] = Field(default_factory=list)


class ArtifactRef(SchemaBase):
    """A file produced during execution."""

    name: str
    kind: Literal["image", "data", "document", "file"]
    size_bytes: int
    encoding: Literal["utf-8", "base64"]
    content: str
    produced_by: str = Field(description="The provider that generated it.")


class ExecutionStep(SchemaBase):
    """One step of the plan, and what became of it."""

    capability: str
    provider: str | None = None
    required: bool = False
    description: str = ""
    ok: bool | None = None
    duration_ms: int | None = None
    error: str | None = None
    #: Set when the step did not run. Present in the report rather than
    #: omitted, so thorough coverage is distinguishable from a missing key.
    skipped_because: str | None = None


class ProviderTiming(SchemaBase):
    """What one provider contributed, and what it cost in time."""

    provider: str
    capability: str
    ok: bool
    duration_ms: int | None = None
    citations: int = 0


class Performance(SchemaBase):
    total_ms: int | None = None
    provider_ms: int | None = Field(
        default=None, description="Time spent waiting on providers."
    )
    steps_run: int = 0
    steps_skipped: int = 0
    cache_hit: bool = False
    cache_backend: str | None = None


class Report(SchemaBase):
    """The structured result of one task."""

    task_id: str
    kind: str = Field(description="research | website_audit | repository_analysis | …")
    request: str
    created_at: datetime

    summary: str | None = Field(
        default=None,
        description="Generated prose. Null when no model was configured or asked.",
    )
    summary_status: str = "pending"
    summary_detail: str | None = Field(
        default=None, description="Why a summary is absent, when it is."
    )

    reasoning: list[str] = Field(
        default_factory=list,
        description="How the plan was chosen and what it decided along the way.",
    )
    evidence: list[EvidenceItem] = Field(default_factory=list)
    sources: list[Citation] = Field(default_factory=list)
    artifacts: list[ArtifactRef] = Field(default_factory=list)

    timeline: list[ExecutionStep] = Field(
        default_factory=list, description="The plan, in order, with outcomes."
    )
    providers: list[ProviderTiming] = Field(default_factory=list)
    performance: Performance = Field(default_factory=Performance)

    confidence: Confidence = Field(
        default="unknown",
        description=(
            "How much of the plan actually ran. `unknown` when nothing "
            "established anything — never a default that reads as reassurance."
        ),
    )
    confidence_reason: str | None = None

    #: Variables that would have unlocked a step that could not run. The report
    #: says what it could not do and exactly how to fix it.
    blocked_by: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    error: str | None = None
