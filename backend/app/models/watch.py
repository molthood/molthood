"""Watchlist ORM model.

A subject somebody asked to be told about. This is the piece that turns change
detection from a thing you can do into a thing that happens: a website that
stops resolving at 3am is worthless as a finding if nobody looks again until
they happen to.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Watch(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One subject under observation, owned by one API key."""

    __tablename__ = "watches"

    #: Whose watch this is. Everything about it — the runs it produces, the
    #: changes it reports — is scoped to this, exactly like execution history.
    api_key_id: Mapped[str] = mapped_column(String(32), index=True)

    target: Mapped[str] = mapped_column(String(32))
    #: Null only for a chain-level watch, which has no address.
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    label: Mapped[str] = mapped_column(String(120), default="")

    #: How often to look. Enforced against a floor in settings, because every
    #: check spends the owner's analysis quota.
    interval_seconds: Mapped[int] = mapped_column(Integer, default=3600)

    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    #: When the monitor last completed a check. Null means it has never run,
    #: which is different from "ran and found nothing" and is why the column is
    #: nullable rather than defaulting to the creation time.
    last_checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    last_execution_id: Mapped[str | None] = mapped_column(String(32), nullable=True)

    #: Set when a check could not run — a spent quota, an upstream outage. Kept
    #: so the console can say why a watch has gone quiet instead of showing a
    #: stale timestamp and letting the reader assume all is well.
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    #: Running totals, so the console can show "3 alarming changes since you
    #: started watching" without re-diffing every stored run.
    checks_run: Mapped[int] = mapped_column(Integer, default=0)
    changes_seen: Mapped[int] = mapped_column(Integer, default=0)
    alarms_seen: Mapped[int] = mapped_column(Integer, default=0)

    #: The most recent change report, so the console has something to render
    #: without loading the whole execution behind it.
    last_changes: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Watch {self.target} {self.address} every {self.interval_seconds}s>"
