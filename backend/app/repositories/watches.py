"""Storage for the watchlist.

Reads and writes are scoped to an owner for the same reason execution history
is: a watch records the address somebody cares about, and that is at least as
sensitive as having analysed it once.
"""

from __future__ import annotations

import asyncio
import builtins
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any

from sqlalchemy import select

from app.core.database import get_session_factory
from app.logging import get_logger
from app.models.base import utcnow
from app.models.watch import Watch

logger = get_logger(__name__)

#: Most watches one key may hold. Each is a recurring charge against that key's
#: analysis quota, so an unbounded list would silently drain it.
MAX_PER_KEY = 25


def _as_utc(moment: datetime | None) -> datetime | None:
    """SQLite hands timestamps back naive; see `execution_store._as_utc`."""
    if moment is None:
        return None
    return moment.replace(tzinfo=UTC) if moment.tzinfo is None else moment


@dataclass(slots=True)
class WatchRecord:
    """One watch, flattened for the API."""

    id: str
    target: str
    address: str | None
    label: str
    interval_seconds: int
    active: bool
    last_checked_at: datetime | None
    last_execution_id: str | None
    last_error: str | None
    checks_run: int
    changes_seen: int
    alarms_seen: int
    last_changes: dict[str, Any]
    created_at: datetime

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "target": self.target,
            "address": self.address,
            "label": self.label,
            "interval_seconds": self.interval_seconds,
            "active": self.active,
            "last_checked_at": self.last_checked_at,
            "last_execution_id": self.last_execution_id,
            "last_error": self.last_error,
            "checks_run": self.checks_run,
            "changes_seen": self.changes_seen,
            "alarms_seen": self.alarms_seen,
            "last_changes": self.last_changes,
            "created_at": self.created_at,
        }

    @classmethod
    def from_row(cls, row: Watch) -> WatchRecord:
        return cls(
            id=row.id,
            target=row.target,
            address=row.address,
            label=row.label,
            interval_seconds=row.interval_seconds,
            active=row.active,
            last_checked_at=_as_utc(row.last_checked_at),
            last_execution_id=row.last_execution_id,
            last_error=row.last_error,
            checks_run=row.checks_run,
            changes_seen=row.changes_seen,
            alarms_seen=row.alarms_seen,
            last_changes=dict(row.last_changes or {}),
            created_at=_as_utc(row.created_at) or utcnow(),
        )


@dataclass(frozen=True, slots=True)
class DueWatch:
    """The minimum the monitor needs to run one check."""

    id: str
    api_key_id: str
    target: str
    address: str | None


class WatchStore:
    """The watchlist, and which entries are due."""

    # --- writes ---

    def _create(
        self,
        *,
        owner_key_id: str,
        target: str,
        address: str | None,
        label: str,
        interval_seconds: int,
    ) -> WatchRecord | None:
        """Add a watch, or return None if this subject is already watched.

        Duplicates are refused rather than merged: two entries for one token
        would double the quota it costs and report every change twice.
        """
        with get_session_factory()() as session:
            existing = session.scalars(
                select(Watch).where(
                    Watch.api_key_id == owner_key_id,
                    Watch.target == target,
                    Watch.address == address
                    if address is not None
                    else Watch.address.is_(None),
                )
            ).first()
            if existing is not None:
                return None

            row = Watch(
                api_key_id=owner_key_id,
                target=target,
                address=address,
                label=label[:120],
                interval_seconds=interval_seconds,
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return WatchRecord.from_row(row)

    async def create(
        self,
        *,
        owner_key_id: str,
        target: str,
        address: str | None,
        label: str = "",
        interval_seconds: int,
    ) -> WatchRecord | None:
        return await asyncio.to_thread(
            self._create,
            owner_key_id=owner_key_id,
            target=target,
            address=address,
            label=label,
            interval_seconds=interval_seconds,
        )

    def count_for(self, owner_key_id: str) -> int:
        with get_session_factory()() as session:
            return len(
                session.scalars(
                    select(Watch.id).where(Watch.api_key_id == owner_key_id)
                ).all()
            )

    def delete(self, watch_id: str, owner_key_id: str) -> bool:
        with get_session_factory()() as session:
            row = session.scalars(
                select(Watch).where(
                    Watch.id == watch_id, Watch.api_key_id == owner_key_id
                )
            ).first()
            if row is None:
                return False
            session.delete(row)
            session.commit()
            return True

    def set_active(self, watch_id: str, owner_key_id: str, active: bool) -> bool:
        with get_session_factory()() as session:
            row = session.scalars(
                select(Watch).where(
                    Watch.id == watch_id, Watch.api_key_id == owner_key_id
                )
            ).first()
            if row is None:
                return False
            row.active = active
            session.commit()
            return True

    # --- reads ---

    def list(self, owner_key_id: str) -> builtins.list[WatchRecord]:
        with get_session_factory()() as session:
            rows = session.scalars(
                select(Watch)
                .where(Watch.api_key_id == owner_key_id)
                .order_by(Watch.created_at.desc())
                .limit(MAX_PER_KEY * 2)
            ).all()
            return [WatchRecord.from_row(row) for row in rows]

    def get(self, watch_id: str, owner_key_id: str) -> WatchRecord | None:
        with get_session_factory()() as session:
            row = session.scalars(
                select(Watch).where(
                    Watch.id == watch_id, Watch.api_key_id == owner_key_id
                )
            ).first()
            return WatchRecord.from_row(row) if row else None

    def due(self, *, limit: int) -> builtins.list[DueWatch]:
        """Active watches whose interval has elapsed, oldest check first.

        A watch that has never run is due immediately — that is what makes the
        first check happen when the list is created rather than an hour later.

        The interval comparison happens in Python. Expressing "last checked
        more than `interval_seconds` ago" in SQL means arithmetic between a
        timestamp and a *column*, which has no portable spelling across SQLite
        and PostgreSQL. The candidate set is bounded by the oldest-first order
        and a hard row cap, so the cost of filtering here is a few rows read
        and discarded rather than a full scan.
        """
        now = utcnow()
        # Enough headroom that filtering cannot starve the batch, without
        # loading a whole table that may be mostly not-yet-due.
        candidates = max(limit * 8, 64)

        with get_session_factory()() as session:
            rows = session.scalars(
                select(Watch)
                .where(Watch.active.is_(True))
                .order_by(Watch.last_checked_at.asc().nulls_first())
                .limit(candidates)
            ).all()

        due: builtins.list[DueWatch] = []
        for row in rows:
            checked = _as_utc(row.last_checked_at)
            if checked is not None and now - checked < timedelta(
                seconds=row.interval_seconds
            ):
                # Ordered oldest-first, so everything after this is newer and
                # therefore also not due.
                break

            due.append(
                DueWatch(
                    id=row.id,
                    api_key_id=row.api_key_id,
                    target=row.target,
                    address=row.address,
                )
            )
            if len(due) >= limit:
                break

        return due

    # --- results ---

    def record_check(
        self,
        watch_id: str,
        *,
        execution_id: str | None,
        changes: dict[str, Any] | None,
        error: str | None = None,
    ) -> None:
        """Mark a check complete and fold in whatever it found.

        `last_checked_at` is set even when the check failed. Leaving it unset
        would make the watch permanently due and retry in a tight loop against
        whatever is already broken.
        """
        with get_session_factory()() as session:
            row = session.get(Watch, watch_id)
            if row is None:
                return

            row.last_checked_at = utcnow()
            row.checks_run += 1
            row.last_error = error

            if execution_id is not None:
                row.last_execution_id = execution_id

            if changes is not None:
                row.last_changes = changes
                row.changes_seen += int(changes.get("total") or 0)
                row.alarms_seen += int(changes.get("alarming") or 0)

            session.commit()


@lru_cache(maxsize=1)
def get_watch_store() -> WatchStore:
    return WatchStore()
