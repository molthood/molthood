"""Execution and task ORM models."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import AgentKind, ExecutionStatus, PipelineStage, TaskStatus


class Execution(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One request as it moves through the pipeline."""

    __tablename__ = "executions"

    project_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )

    request: Mapped[str] = mapped_column(Text)
    status: Mapped[ExecutionStatus] = mapped_column(
        Enum(ExecutionStatus, native_enum=False, length=16),
        default=ExecutionStatus.QUEUED,
        index=True,
    )
    stage: Mapped[PipelineStage] = mapped_column(
        Enum(PipelineStage, native_enum=False, length=16),
        default=PipelineStage.INPUT,
        index=True,
    )
    pipeline_name: Mapped[str] = mapped_column(String(64), default="standard")

    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    result: Mapped[str] = mapped_column(Text, default="")
    #: Structured output produced by the pipeline.
    output: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    #: Artifacts collected during the evidence stage.
    evidence: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    #: The key that ran this. Nullable because rows written before
    #: authentication existed have no owner, and deleting real history to
    #: introduce a column would be worse than carrying the null.
    #:
    #: Not a ForeignKey on purpose: revoking a key must not cascade away the
    #: analyses it produced, and an execution outliving its credential is the
    #: expected case rather than a broken reference.
    api_key_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)

    #: Whether this run may appear in the public feed.
    #:
    #: False for everything, always, unless the owner explicitly publishes it.
    #: An execution records the address somebody asked about, so a feed that
    #: opted people in by default would publish exactly what scoping history
    #: per key was built to protect.
    #: `server_default` as well as `default`: the Python default only applies
    #: to rows this application inserts, so an `ALTER TABLE ... ADD COLUMN`
    #: against 91 existing rows had nothing to put in them and was refused.
    #:
    #: `false()` and not `text("0")`. SQLite has no boolean type and accepts the
    #: integer happily; PostgreSQL rejects the whole `CREATE TABLE` with "column
    #: is of type boolean but default expression is of type integer". That took
    #: down schema creation on the first real deployment — every table, not just
    #: this one — while the process started and served health checks normally.
    public: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False, index=True
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # --- What the analysis was about ---
    #: Indexed together because the cache looks a run up by exactly this pair.
    target: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    # --- What it produced ---
    #: Kept apart from `evidence` for the same reason everywhere else: this is
    #: model-generated prose and the evidence is not.
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_status: Mapped[str] = mapped_column(String(32), default="pending")
    #: *Why* a summary is absent. Dropped on storage originally, so a permalink
    #: showed "no summary" with no explanation — which is the one thing this
    #: platform is not allowed to do with a missing value.
    summary_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_model: Mapped[str | None] = mapped_column(String(128), nullable=True)

    agents_used: Mapped[list[str]] = mapped_column(JSON, default=list)
    services_called: Mapped[list[str]] = mapped_column(JSON, default=list)
    sources: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    facts: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    stages: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)

    tasks: Mapped[list[Task]] = relationship(
        back_populates="execution",
        cascade="all, delete-orphan",
        order_by="Task.sequence",
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Execution id={self.id} status={self.status} stage={self.stage}>"


class Task(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A single unit of work inside an execution, owned by one agent."""

    __tablename__ = "tasks"

    execution_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("executions.id", ondelete="CASCADE"), index=True
    )

    sequence: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(160))
    agent_kind: Mapped[AgentKind | None] = mapped_column(
        Enum(AgentKind, native_enum=False, length=32), nullable=True
    )
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, native_enum=False, length=16), default=TaskStatus.PENDING
    )

    payload: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    output: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    execution: Mapped[Execution] = relationship(back_populates="tasks")

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Task name={self.name} status={self.status}>"
