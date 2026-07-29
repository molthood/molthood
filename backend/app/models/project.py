"""Project ORM model."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import ProjectStatus


class Project(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Groups related executions under a single objective."""

    __tablename__ = "projects"

    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[ProjectStatus] = mapped_column(
        Enum(ProjectStatus, native_enum=False, length=16),
        default=ProjectStatus.ACTIVE,
        index=True,
    )

    #: Agent kinds assigned to this project.
    agent_kinds: Mapped[list[str]] = mapped_column(JSON, default=list)
    settings: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)

    execution_count: Mapped[int] = mapped_column(Integer, default=0)
    last_execution_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    last_execution_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Project slug={self.slug} status={self.status}>"
