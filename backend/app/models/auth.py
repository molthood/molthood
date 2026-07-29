"""API key ORM model.

One row per key. There is no user table above it: a key *is* the account, which
is the smallest thing that can honestly scope history and cap spend. A real
user model can be added later without changing anything that reads these.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ApiKey(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A credential, and the allowance that goes with it."""

    __tablename__ = "api_keys"

    #: SHA-256 of the secret. The secret itself is shown once at creation and
    #: is not recoverable from here — a database leak yields no working keys.
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    #: The first few characters, so a person can tell their own keys apart in a
    #: list. Far too short to be usable as a credential.
    hint: Mapped[str] = mapped_column(String(32))
    label: Mapped[str] = mapped_column(String(120), default="")

    #: Analyses per UTC day. This is the spend cap, and it lives in the
    #: database rather than in memory because it protects real money and must
    #: survive a restart and hold across multiple workers.
    daily_quota: Mapped[int] = mapped_column(Integer, default=50)
    used_today: Mapped[int] = mapped_column(Integer, default=0)
    #: The UTC day `used_today` refers to. Comparing against today's date is
    #: what resets the counter, so no scheduled job is needed.
    quota_day: Mapped[date | None] = mapped_column(Date, nullable=True)

    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    #: Set on the key that created the platform's first credential. An admin
    #: key may read every execution; an ordinary key sees only its own.
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    #: Recorded at creation so a self-serve signup can be rate-limited per
    #: source without keeping a separate table.
    created_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<ApiKey {self.hint} quota={self.used_today}/{self.daily_quota}>"
