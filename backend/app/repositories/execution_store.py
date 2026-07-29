"""Durable record of every execution this platform has run.

This was an in-memory ring that died with the process, which meant the console
showed genuine runs that then vanished on restart — real data behaving like
placeholder data. It is now backed by the database, which buys three things
beyond survival:

  * a permalink, because a result that no longer exists cannot be shared;
  * a cache, because re-running an identical analysis costs seconds of the
    user's time and real credit for a summary that would say the same thing;
  * honest aggregates, because a "success rate" over one process is not a rate.

Writes go through `asyncio.to_thread`. SQLAlchemy's session here is
synchronous and the caller is a coroutine; committing inline would block the
event loop for every other execution in flight.
"""

from __future__ import annotations

import asyncio
import builtins
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any

from sqlalchemy import func, select

from app.config import get_settings
from app.core.database import get_session_factory
from app.engine.result import ExecutionResult, StageResult
from app.logging import get_logger
from app.models.base import utcnow
from app.models.enums import ExecutionStatus, PipelineStage
from app.models.execution import Execution

logger = get_logger(__name__)

#: Default page size for list views.
DEFAULT_LIMIT = 20


@dataclass(slots=True)
class ExecutionRecord:
    """A completed run, flattened for list views."""

    id: str
    request: str
    target: str | None
    address: str | None
    status: str
    stage: str
    agents_used: list[str]
    services_called: list[str]
    summary: str | None
    summary_status: str
    evidence_count: int
    sources_count: int
    duration_ms: int | None
    error: str | None
    created_at: datetime = field(default_factory=utcnow)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "request": self.request,
            "target": self.target,
            "address": self.address,
            "status": self.status,
            "stage": self.stage,
            "agents_used": self.agents_used,
            "services_called": self.services_called,
            "summary": self.summary,
            "summary_status": self.summary_status,
            "evidence_count": self.evidence_count,
            "sources_count": self.sources_count,
            "duration_ms": self.duration_ms,
            "error": self.error,
            "created_at": self.created_at,
        }

    @classmethod
    def from_row(cls, row: Execution) -> ExecutionRecord:
        return cls(
            id=row.id,
            request=row.request,
            target=row.target,
            address=row.address,
            status=_value(row.status),
            stage=_value(row.stage),
            agents_used=list(row.agents_used or []),
            services_called=list(row.services_called or []),
            summary=row.summary,
            summary_status=row.summary_status,
            evidence_count=len(row.evidence or []),
            sources_count=len(row.sources or []),
            duration_ms=row.duration_ms,
            error=row.error,
            created_at=_as_utc(row.created_at),
        )


def _value(raw: Any) -> str:
    """SQLAlchemy may hand back the enum or the stored string."""
    return raw.value if hasattr(raw, "value") else str(raw)


def _as_utc(moment: datetime) -> datetime:
    """Re-attach the timezone SQLite drops.

    The column is declared `DateTime(timezone=True)` and written with an aware
    value, but SQLite has no timezone type and hands the value back naive. Two
    things broke on that: subtracting it from `utcnow()` raised outright, and
    serialising it produced an ISO string with no offset, which a browser then
    read as *local* time — every stored run appeared hours off.

    Normalising on read fixes both at the one point where stored values
    re-enter the application.
    """
    return moment.replace(tzinfo=UTC) if moment.tzinfo is None else moment


def _stages_from(raw: Any) -> list[StageResult]:
    """Rebuild the pipeline trace from its stored form.

    Skipped originally, which meant a permalink and a cache hit both rendered
    an analysis with an empty Pipeline section — the one part of the report
    that says how the answer was reached. The rows were being written all
    along; only the read was missing.
    """
    stages: list[StageResult] = []
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        try:
            stage = PipelineStage(str(item.get("stage")))
        except ValueError:
            continue
        stages.append(
            StageResult(
                stage=stage,
                success=bool(item.get("success")),
                summary=str(item.get("summary") or ""),
                error=item.get("error"),
                duration_ms=item.get("duration_ms"),
            )
        )
    return stages


def _to_result(row: Execution) -> ExecutionResult:
    """Rebuild the full result object from a stored row.

    The permalink renders everything the original response carried, so nothing
    may be lost on the way in or out.
    """
    return ExecutionResult(
        execution_id=row.id,
        status=ExecutionStatus(_value(row.status)),
        stage=PipelineStage(_value(row.stage)),
        target=row.target,
        address=row.address,
        owner_key_id=row.api_key_id,
        agents_used=list(row.agents_used or []),
        services_called=list(row.services_called or []),
        summary=row.summary,
        summary_status=row.summary_status,
        summary_detail=row.summary_detail,
        summary_model=row.summary_model,
        facts=dict(row.facts or {}),
        evidence=list(row.evidence or []),
        # Stored as JSON, so the concrete value type is only known at runtime.
        sources=[
            {str(key): str(value) for key, value in source.items()}
            for source in (row.sources or [])
        ],
        stages=_stages_from(row.stages),
        execution_time_ms=row.duration_ms,
        error=row.error,
    )


@dataclass(slots=True)
class PreviousRun:
    """An earlier analysis of the same subject, for comparison.

    Carries `created_at` because "what changed" is meaningless without "since
    when", and the full result object does not record it.
    """

    execution_id: str
    created_at: datetime
    evidence: list[dict[str, Any]]
    facts: dict[str, Any]


class ExecutionStore:
    """Durable, newest-first store of executions."""

    # --- writes ---

    def _write(self, request_text: str, result: ExecutionResult) -> ExecutionRecord:
        with get_session_factory()() as session:
            row = Execution(
                id=result.execution_id,
                request=request_text,
                status=result.status,
                stage=result.stage,
                target=result.target,
                address=result.address,
                api_key_id=result.owner_key_id,
                agents_used=list(result.agents_used),
                services_called=list(result.services_called),
                summary=result.summary,
                summary_status=result.summary_status,
                summary_detail=result.summary_detail,
                summary_model=result.summary_model,
                facts=result.facts,
                evidence=result.evidence,
                sources=result.sources,
                stages=[stage.to_dict() for stage in result.stages],
                duration_ms=result.execution_time_ms,
                error=result.error,
                finished_at=utcnow(),
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return ExecutionRecord.from_row(row)

    async def record(
        self, request_text: str, result: ExecutionResult
    ) -> ExecutionRecord | None:
        """Persist a finished run.

        A storage failure must never fail an execution that already succeeded,
        so this logs and returns None rather than raising into the engine.
        """
        try:
            return await asyncio.to_thread(self._write, request_text, result)
        except Exception as exc:
            logger.warning("execution_not_persisted", error=str(exc))
            return None

    # --- reads ---
    #
    # Every read takes an `owner_key_id`. That is not a convenience parameter:
    # a wallet analysis records the address someone asked about, and before
    # authentication existed the whole list was world-readable. Scoping is the
    # default here so a future query cannot forget to apply it.

    def _scoped(self, statement: Any, owner_key_id: str | None) -> Any:
        """Restrict a query to one owner, unless it is an unscoped read.

        `None` means "no filter" and is reserved for admin listings and the
        open-mode developer setup. It is passed explicitly at every call site
        so that choice is always visible in the caller.
        """
        if owner_key_id is None:
            return statement
        return statement.where(Execution.api_key_id == owner_key_id)

    def _query(
        self, offset: int, limit: int, owner_key_id: str | None
    ) -> builtins.list[ExecutionRecord]:
        with get_session_factory()() as session:
            statement = self._scoped(select(Execution), owner_key_id)
            rows = session.scalars(
                statement.order_by(Execution.created_at.desc())
                .offset(offset)
                .limit(limit)
            ).all()
            return [ExecutionRecord.from_row(row) for row in rows]

    def list(
        self,
        *,
        offset: int = 0,
        limit: int = DEFAULT_LIMIT,
        owner_key_id: str | None = None,
    ) -> builtins.list[ExecutionRecord]:
        # `builtins.list` because this method shadows the builtin in the class
        # body.
        return self._query(offset, limit, owner_key_id)

    def all(self, owner_key_id: str | None = None) -> builtins.list[ExecutionRecord]:
        return self._query(0, 500, owner_key_id)

    def get(
        self, execution_id: str, owner_key_id: str | None = None
    ) -> ExecutionRecord | None:
        row = self._fetch(execution_id, owner_key_id)
        return ExecutionRecord.from_row(row) if row else None

    def get_result(
        self, execution_id: str, owner_key_id: str | None = None
    ) -> ExecutionResult | None:
        """The complete stored result — what a shared link renders."""
        row = self._fetch(execution_id, owner_key_id)
        return _to_result(row) if row else None

    def _fetch(self, execution_id: str, owner_key_id: str | None) -> Execution | None:
        """One row, only if the caller is entitled to it.

        A permalink id is 32 hex characters and unguessable, but that is
        obscurity rather than access control — anyone who has ever been sent a
        link would otherwise keep it forever, including after a key is revoked.
        """
        with get_session_factory()() as session:
            statement = self._scoped(
                select(Execution).where(Execution.id == execution_id), owner_key_id
            )
            row: Execution | None = session.scalars(statement).first()
            return row

    def find_recent(
        self,
        target: str | None,
        address: str | None,
        max_age_seconds: int,
        owner_key_id: str | None = None,
    ) -> ExecutionResult | None:
        """The most recent successful analysis of the same subject, if fresh.

        Only successes are reused. Serving a stored failure would turn one
        upstream hiccup into ten minutes of the same error.
        """
        if max_age_seconds <= 0 or target is None:
            return None

        cutoff = utcnow() - timedelta(seconds=max_age_seconds)

        with get_session_factory()() as session:
            statement = self._scoped(
                select(Execution).where(
                    Execution.target == target,
                    Execution.status == ExecutionStatus.SUCCEEDED,
                    Execution.created_at >= cutoff,
                ),
                owner_key_id,
            )
            statement = statement.where(
                Execution.address == address
                if address is not None
                else Execution.address.is_(None)
            )
            row = session.scalars(
                statement.order_by(Execution.created_at.desc()).limit(1)
            ).first()
            return _to_result(row) if row else None

    def find_previous(
        self,
        target: str | None,
        address: str | None,
        *,
        exclude_id: str,
        max_age_seconds: int,
        owner_key_id: str | None = None,
    ) -> PreviousRun | None:
        """The last successful analysis of the same subject before this one.

        Only successes are compared. A failed run has partial evidence, and
        diffing against it would report every check that simply did not get to
        run as something that changed.

        `exclude_id` matters more than it looks: the current execution is
        written to this table by the engine, so without it a run could compare
        against itself the moment persistence ordering changed.

        Scoped to the owner. Comparing against a stranger's run would produce a
        change report linking to an execution the reader cannot open, and would
        disclose that somebody else had looked at the same address.
        """
        if target is None or max_age_seconds <= 0:
            return None

        cutoff = utcnow() - timedelta(seconds=max_age_seconds)

        with get_session_factory()() as session:
            statement = self._scoped(
                select(Execution).where(
                    Execution.target == target,
                    Execution.status == ExecutionStatus.SUCCEEDED,
                    Execution.created_at >= cutoff,
                    Execution.id != exclude_id,
                ),
                owner_key_id,
            )
            statement = statement.where(
                Execution.address == address
                if address is not None
                else Execution.address.is_(None)
            )
            row = session.scalars(
                statement.order_by(Execution.created_at.desc()).limit(1)
            ).first()

            if row is None:
                return None

            return PreviousRun(
                execution_id=row.id,
                created_at=_as_utc(row.created_at),
                evidence=list(row.evidence or []),
                facts=dict(row.facts or {}),
            )

    def subjects(self, owner_key_id: str | None) -> builtins.list[dict[str, Any]]:
        """Everything this key has analysed, grouped by subject.

        Derived from the executions that already exist rather than stored
        separately. A "project" here is not a thing somebody created and named
        — it is simply a subject that has been looked at more than once, which
        is the grouping that actually earns its place: it is what makes "what
        changed since last time" a question worth asking.
        """
        with get_session_factory()() as session:
            statement = self._scoped(
                select(Execution).where(Execution.target.is_not(None)), owner_key_id
            )
            rows = session.scalars(
                statement.order_by(Execution.created_at.desc()).limit(500)
            ).all()

            grouped: dict[tuple[str, str | None], dict[str, Any]] = {}

            for row in rows:
                key = (row.target or "", row.address)
                entry = grouped.get(key)

                if entry is None:
                    grouped[key] = entry = {
                        "target": row.target,
                        "address": row.address,
                        "runs": 0,
                        "succeeded": 0,
                        "first_seen": _as_utc(row.created_at),
                        "last_seen": _as_utc(row.created_at),
                        "last_execution_id": row.id,
                        "last_summary": row.summary,
                        "findings": len(row.evidence or []),
                        "risk_score": None,
                        "risk_level": None,
                        "changes": 0,
                        "alarming": 0,
                    }
                    # Rows arrive newest-first, so the first one seen for a
                    # subject is its latest state.
                    facts = row.facts or {}
                    risk = facts.get("risk") if isinstance(facts, dict) else None
                    if isinstance(risk, dict):
                        entry["risk_score"] = risk.get("score")
                        entry["risk_level"] = risk.get("level")
                    changes = facts.get("changes") if isinstance(facts, dict) else None
                    if isinstance(changes, dict):
                        entry["changes"] = changes.get("total") or 0
                        entry["alarming"] = changes.get("alarming") or 0

                entry["runs"] += 1
                if _value(row.status) == ExecutionStatus.SUCCEEDED.value:
                    entry["succeeded"] += 1
                entry["first_seen"] = _as_utc(row.created_at)

            return sorted(
                grouped.values(), key=lambda item: item["last_seen"], reverse=True
            )

    def agent_stats(self) -> dict[str, dict[str, Any]]:
        """How each agent has actually performed, keyed by agent name.

        Deliberately carries no addresses and no request text. The agents
        endpoint is unauthenticated — it describes the runtime, not anybody's
        work — so what it may report about past runs is limited to counts,
        timings, and the *kind* of subject involved.
        """
        with get_session_factory()() as session:
            rows = session.scalars(
                select(Execution).order_by(Execution.created_at.desc()).limit(1000)
            ).all()

        stats: dict[str, dict[str, Any]] = {}

        for row in rows:
            succeeded = _value(row.status) == ExecutionStatus.SUCCEEDED.value
            created = _as_utc(row.created_at)

            for name in row.agents_used or []:
                entry = stats.get(name)
                if entry is None:
                    stats[name] = entry = {
                        "runs": 0,
                        "succeeded": 0,
                        "failed": 0,
                        "last_run_at": created,
                        "durations": [],
                        "targets": {},
                    }

                entry["runs"] += 1
                entry["succeeded" if succeeded else "failed"] += 1
                if row.duration_ms is not None:
                    entry["durations"].append(row.duration_ms)
                if row.target:
                    targets = entry["targets"]
                    targets[row.target] = targets.get(row.target, 0) + 1

        # Collapse the accumulators into the shape the API reports. Median
        # rather than mean: one cold start on a rate-limited provider should
        # not become this agent's advertised speed.
        for entry in stats.values():
            durations = sorted(entry.pop("durations"))
            entry["median_duration_ms"] = (
                durations[len(durations) // 2] if durations else None
            )
            targets = entry.pop("targets")
            entry["targets"] = sorted(
                ({"target": name, "runs": count} for name, count in targets.items()),
                key=lambda item: item["runs"],
                reverse=True,
            )

        return stats

    def publish(self, execution_id: str, owner_key_id: str, public: bool) -> bool:
        """Opt one run into — or out of — the public feed.

        Owner-scoped: only the key that ran it may publish it, so nobody can
        expose somebody else's analysis.
        """
        with get_session_factory()() as session:
            row = session.scalars(
                select(Execution).where(
                    Execution.id == execution_id,
                    Execution.api_key_id == owner_key_id,
                )
            ).first()
            if row is None:
                return False

            row.public = public
            row.published_at = utcnow() if public else None
            session.commit()
            return True

    def public_feed(self, *, limit: int = 12) -> builtins.list[Execution]:
        """Published runs, newest first.

        Returns rows rather than records because the caller redacts them
        through `schemas.public_feed`, which is the only place allowed to
        decide what a stranger may see.
        """
        with get_session_factory()() as session:
            return list(
                session.scalars(
                    select(Execution)
                    .where(Execution.public.is_(True))
                    .order_by(Execution.created_at.desc())
                    .limit(min(limit, 50))
                ).all()
            )

    def count(self) -> int:
        with get_session_factory()() as session:
            return int(session.scalar(select(func.count()).select_from(Execution)) or 0)

    def stats(self, owner_key_id: str | None = None) -> dict[str, Any]:
        """Aggregates over the caller's runs.

        Scoped for the same reason the list is. A global success rate looks
        harmless until it is the only number on the page and it moves whenever
        a stranger runs something.
        """

        def scoped(statement: Any) -> Any:
            return self._scoped(statement, owner_key_id)

        with get_session_factory()() as session:
            total = int(
                session.scalar(scoped(select(func.count()).select_from(Execution))) or 0
            )

            if total == 0:
                return {
                    "total": 0,
                    "succeeded": 0,
                    "failed": 0,
                    "success_rate": None,
                    "avg_duration_ms": None,
                    "summaries_generated": 0,
                }

            succeeded = int(
                session.scalar(
                    scoped(
                        select(func.count())
                        .select_from(Execution)
                        .where(Execution.status == ExecutionStatus.SUCCEEDED)
                    )
                )
                or 0
            )
            average = session.scalar(
                scoped(select(func.avg(Execution.duration_ms)).select_from(Execution))
            )
            summaries = int(
                session.scalar(
                    scoped(
                        select(func.count())
                        .select_from(Execution)
                        .where(Execution.summary_status == "generated")
                    )
                )
                or 0
            )

        return {
            "total": total,
            "succeeded": succeeded,
            "failed": total - succeeded,
            "success_rate": round(succeeded / total * 100, 1),
            "avg_duration_ms": round(average) if average is not None else None,
            "summaries_generated": summaries,
        }


@lru_cache(maxsize=1)
def get_execution_store() -> ExecutionStore:
    return ExecutionStore()


def cache_window_seconds() -> int:
    return get_settings().analysis_cache_seconds
