"""Report ORM model."""

from __future__ import annotations

from sqlalchemy import JSON, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import ReportCategory


class Report(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """The compiled, auditable record produced by a finished execution."""

    __tablename__ = "reports"

    execution_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("executions.id", ondelete="CASCADE"), index=True
    )
    project_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )

    title: Mapped[str] = mapped_column(String(200))
    category: Mapped[ReportCategory] = mapped_column(
        Enum(ReportCategory, native_enum=False, length=16), index=True
    )
    summary: Mapped[str] = mapped_column(Text, default="")

    #: Ordered document sections; rendered by the client.
    sections: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list)
    #: References to the artifacts backing each claim in the report.
    evidence_refs: Mapped[list[str]] = mapped_column(JSON, default=list)
    page_count: Mapped[int] = mapped_column(Integer, default=0)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Report id={self.id} category={self.category}>"
