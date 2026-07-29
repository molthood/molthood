"""Execution context — the object carried through every pipeline stage."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING, Any

from app.engine.task import Task
from app.models.base import new_id, utcnow
from app.models.enums import EvidenceState, ExecutionStatus, PipelineStage

if TYPE_CHECKING:  # pragma: no cover - avoids a router ↔ context import cycle
    from app.engine.router import RoutingDecision
    from app.services.registry import ServiceRegistry

#: Receives `(event_name, payload)` as an execution progresses. Set only when a
#: caller is watching a live run; everything works identically without one.
EventEmitter = Callable[[str, dict[str, Any]], Awaitable[None]]


@dataclass(slots=True)
class ExecutionRequest:
    """The immutable input that opens an execution."""

    request: str
    project_id: str | None = None
    pipeline: str = "standard"
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class Source:
    """A citable origin for a claim — an explorer page or an API endpoint."""

    label: str
    url: str

    def to_dict(self) -> dict[str, str]:
        return {"label": self.label, "url": self.url}


@dataclass(slots=True)
class Evidence:
    """One raw fact captured while a stage ran.

    Evidence is kept strictly separate from AI output: everything here came
    from a service call and can be traced back to `source_url`.

    `state` carries how firmly the fact is established — see `EvidenceState`.
    A reader must be able to tell a measured "no" from a failed lookup.
    """

    stage: PipelineStage
    kind: str
    label: str
    value: Any = None
    source_url: str | None = None
    state: EvidenceState = EvidenceState.CONFIRMED
    reason: str | None = None
    id: str = field(default_factory=new_id)
    created_at: datetime = field(default_factory=utcnow)

    @property
    def is_reportable(self) -> bool:
        """Whether this belongs in the final evidence list.

        A confirmed finding with no value is an agent saying it had nothing to
        report, so it is dropped. Refuted and unknown findings are always kept:
        they are the two cases the old `value is not None` filter destroyed.
        """
        if self.state is EvidenceState.CONFIRMED:
            return self.value is not None
        return True

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "stage": self.stage.value,
            "kind": self.kind,
            "label": self.label,
            "value": self.value,
            "source_url": self.source_url,
            "state": self.state.value,
            "reason": self.reason,
            "created_at": self.created_at,
        }


@dataclass(slots=True)
class ExecutionContext:
    """Mutable state threaded through the pipeline.

    Stages read what earlier stages wrote and append their own output.
    """

    request: ExecutionRequest
    services: ServiceRegistry
    execution_id: str = field(default_factory=new_id)
    #: Whose run this is. None only when authentication is disabled.
    owner_key_id: str | None = None
    status: ExecutionStatus = ExecutionStatus.QUEUED
    stage: PipelineStage = PipelineStage.INPUT
    started_at: datetime | None = None
    finished_at: datetime | None = None

    routing: RoutingDecision | None = None
    tasks: list[Task] = field(default_factory=list)

    #: Raw, structured facts gathered from services — never AI-generated.
    facts: dict[str, Any] = field(default_factory=dict)
    evidence: list[Evidence] = field(default_factory=list)
    sources: list[Source] = field(default_factory=list)

    #: Names of the services actually called, for the execution log.
    services_called: list[str] = field(default_factory=list)

    summary: str | None = None
    summary_status: str = "pending"
    summary_detail: str | None = None
    summary_model: str | None = None

    output: dict[str, Any] = field(default_factory=dict)
    error: str | None = None

    #: Set when a client is watching this run live. Optional by design: an
    #: execution must behave identically whether or not anyone is listening.
    emitter: EventEmitter | None = None

    #: Whether to generate the AI summary. False for background monitoring,
    #: where the diff is the product and prose would be over half the wall time
    #: spent restating an unchanged token every interval.
    summarize: bool = True

    async def publish(self, event: str, **payload: Any) -> None:
        """Report progress to a watching client, if there is one.

        Failures are swallowed. A listener that has disconnected mid-run must
        not take down the execution it was watching — the result is still
        stored and still worth producing.
        """
        if self.emitter is None:
            return
        try:
            await self.emitter(event, payload)
        except Exception:
            # A dead listener is not an error. Detach it so the rest of the run
            # is not spent raising into a closed connection.
            self.emitter = None

    def add_evidence(
        self,
        *,
        kind: str,
        label: str,
        value: Any = None,
        source_url: str | None = None,
        state: EvidenceState = EvidenceState.CONFIRMED,
        reason: str | None = None,
        stage: PipelineStage | None = None,
    ) -> Evidence:
        item = Evidence(
            stage=stage or self.stage,
            kind=kind,
            label=label,
            value=value,
            source_url=source_url,
            state=state,
            reason=reason,
        )
        self.evidence.append(item)
        return item

    def add_source(self, label: str, url: str) -> None:
        if not any(source.url == url for source in self.sources):
            self.sources.append(Source(label=label, url=url))

    def note_service(self, name: str) -> None:
        if name not in self.services_called:
            self.services_called.append(name)

    @property
    def duration_ms(self) -> int | None:
        if self.started_at is None or self.finished_at is None:
            return None
        return int((self.finished_at - self.started_at).total_seconds() * 1000)
