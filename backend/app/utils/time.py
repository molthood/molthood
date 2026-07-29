"""Time helpers. Everything the application produces is timezone-aware UTC."""

from __future__ import annotations

from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC)


def to_millis(delta_seconds: float) -> int:
    return int(delta_seconds * 1000)


def duration_ms(start: datetime, end: datetime) -> int:
    return to_millis((end - start).total_seconds())


def isoformat(value: datetime) -> str:
    """Serialise as ISO-8601, normalising naive values to UTC."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat()
