"""Execution schemas — the standard response object every analysis returns."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from app.models.enums import (
    AgentKind,
    EvidenceState,
    ExecutionStatus,
    PipelineStage,
    TaskStatus,
)
from app.schemas.common import SchemaBase

SummaryStatus = Literal["generated", "not_configured", "skipped", "failed", "pending"]


class TaskRead(SchemaBase):
    id: str
    sequence: int
    name: str
    agent_kind: AgentKind | None = None
    status: TaskStatus
    duration_ms: int | None = None
    error: str | None = None


class StageRead(SchemaBase):
    stage: PipelineStage
    success: bool
    summary: str = ""
    error: str | None = None
    duration_ms: int | None = None


class EvidenceItem(SchemaBase):
    """One raw fact observed on chain. Never AI-generated."""

    id: str
    stage: PipelineStage
    kind: str = Field(description="Fact type, e.g. 'holders', 'verification'.")
    label: str
    value: Any = None
    source_url: str | None = Field(
        default=None, description="Where this fact can be independently checked."
    )
    state: EvidenceState = Field(
        default=EvidenceState.CONFIRMED,
        description=(
            "How firmly this is established. `confirmed` was checked and this "
            "is the answer; `refuted` means a claim the subject makes about "
            "itself does not hold; `unknown` means the check could not run, "
            "and `reason` says why. A client must not render `unknown` as a "
            "negative result."
        ),
    )
    reason: str | None = Field(
        default=None, description="Why a check was refuted or could not be made."
    )
    created_at: datetime


class SourceRef(SchemaBase):
    label: str
    url: str


class ExecutionCreate(SchemaBase):
    """Submitting a request for execution."""

    request: str = Field(
        min_length=3,
        max_length=2000,
        description="What to analyse. May contain a 0x address.",
        examples=["Analyze token 0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34"],
    )
    project_id: str | None = None
    pipeline: str = "standard"
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Optional routing hints, e.g. {'target': 'token'}.",
    )


class ExecutionResponse(SchemaBase):
    """The standardized result returned by every execution, for every agent."""

    execution_id: str
    status: ExecutionStatus
    stage: PipelineStage

    target: str | None = Field(
        default=None, description="token | wallet | contract | project"
    )
    address: str | None = None
    agents_used: list[str] = Field(default_factory=list)
    services_called: list[str] = Field(default_factory=list)

    summary: str | None = Field(default=None, description="AI-generated prose.")
    summary_status: SummaryStatus = "pending"
    summary_detail: str | None = Field(
        default=None, description="Why a summary is absent, when it is."
    )
    summary_model: str | None = None

    facts: dict[str, Any] = Field(
        default_factory=dict, description="Structured raw data from services."
    )
    evidence: list[EvidenceItem] = Field(default_factory=list)
    sources: list[SourceRef] = Field(default_factory=list)

    stages: list[StageRead] = Field(default_factory=list)
    tasks: list[TaskRead] = Field(default_factory=list)
    execution_time_ms: int | None = None
    error: str | None = None


class ExecutionRead(SchemaBase):
    """Compact execution record for list views."""

    id: str
    project_id: str | None = None
    request: str
    status: ExecutionStatus
    stage: PipelineStage
    pipeline_name: str
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_ms: int | None = None
    result: str = ""
    error: str | None = None
    created_at: datetime
    updated_at: datetime


class ExecutionDetail(ExecutionRead):
    tasks: list[TaskRead] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    output: dict[str, Any] = Field(default_factory=dict)
