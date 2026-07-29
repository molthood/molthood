"""Agent ORM model."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import AgentKind, AgentStatus


class Agent(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A registered agent and its aggregate runtime metrics."""

    __tablename__ = "agents"

    kind: Mapped[AgentKind] = mapped_column(
        Enum(AgentKind, native_enum=False, length=32), unique=True, index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    version: Mapped[str] = mapped_column(String(32), default="0.1.0")
    status: Mapped[AgentStatus] = mapped_column(
        Enum(AgentStatus, native_enum=False, length=16),
        default=AgentStatus.IDLE,
        index=True,
    )

    capabilities: Mapped[list[str]] = mapped_column(JSON, default=list)
    #: Free-form settings so agents can gain options without a migration.
    config: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)

    total_executions: Mapped[int] = mapped_column(Integer, default=0)
    success_rate: Mapped[float] = mapped_column(Float, default=0.0)
    avg_runtime_ms: Mapped[int] = mapped_column(Integer, default=0)
    last_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Agent kind={self.kind} status={self.status}>"
