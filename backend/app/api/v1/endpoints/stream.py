"""`/api/v1/stream` — one analysis, delivered as it happens.

The same work as the plain `GET /token/{address}`, reported in stages instead
of withheld until all of it is done. That matters because the time is not
evenly spread: the evidence is complete in roughly a third of the run and then
waits behind an AI summary nobody asked to block on. Streaming does not make an
analysis faster — it stops the finished parts being held hostage by the slow
one.

Events, in the order a client sees them:

    stage_started    a stage began; `stage` names it
    stage_finished   that stage's outcome, with its duration
    evidence_ready   every finding, source and fact — the summary is all that
                     is left, so the report can be rendered here
    summary_delta    one fragment of generated prose
    result           the complete stored response, identical to the REST route
    error            the run failed; `message` says why

`result` always arrives, success or failure, so a client has exactly one thing
to wait for.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.api.auth import CurrentKey
from app.api.deps import EngineDep
from app.api.v1.endpoints.execute import to_response
from app.core.exceptions import MolthoodError, UnresolvableHostError
from app.engine.engine import ExecutionEngine
from app.engine.labels import redact_facts, redact_items
from app.engine.router import AnalysisTarget
from app.logging import get_logger
from app.repositories.api_keys import KeyIdentity, get_api_key_store
from app.services.web.fetcher import normalize_url, validate_public_url_async
from app.utils.validation import validate_address

logger = get_logger(__name__)

router = APIRouter(tags=["execution"])

#: Bounded so a client that stops reading cannot make the producer accumulate
#: an unbounded backlog of deltas in memory.
_QUEUE_SIZE = 256

#: Sent when nothing has happened for a while. Some proxies close an idle
#: connection, and a comment line resets that timer without being an event.
_HEARTBEAT_SECONDS = 15.0


def _sse(event: str, payload: dict[str, Any]) -> str:
    # `default=str` because facts carry datetimes, and one unserialisable value
    # must not abort a stream that is otherwise fine.
    body = json.dumps(payload, default=str)
    return f"event: {event}\ndata: {body}\n\n"


async def _resolve_address(target: AnalysisTarget, raw: str | None) -> str | None:
    """Validate the subject exactly as the non-streaming routes do."""
    if target is AnalysisTarget.PROJECT:
        return None

    if raw is None or not raw.strip():
        raise MolthoodError(
            f"A {target.value} analysis needs a subject.",
            details={"target": target.value},
        )

    if target is AnalysisTarget.SITE:
        # A private or malformed host is a caller error; one that simply does
        # not resolve is a finding, and the agent reports it.
        try:
            return await validate_public_url_async(raw)
        except UnresolvableHostError:
            return normalize_url(raw)

    return validate_address(raw)


async def _events(
    engine: ExecutionEngine,
    target: AnalysisTarget,
    address: str | None,
    identity: KeyIdentity,
) -> AsyncIterator[str]:
    queue: asyncio.Queue[tuple[str, dict[str, Any]] | None] = asyncio.Queue(_QUEUE_SIZE)

    async def emit(event: str, payload: dict[str, Any]) -> None:
        # `result` is redacted by `to_response` on the way out, but nothing was
        # doing the same for `evidence_ready` — and that one arrives first and
        # carries the findings the console renders immediately. Supplier names
        # were visible for the whole length of an AI summary and then silently
        # replaced when the run finished.
        if event == "evidence_ready":
            payload = {
                **payload,
                "facts": redact_facts(payload.get("facts")),
                "evidence": redact_items(payload.get("evidence") or []),
                "sources": redact_items(payload.get("sources") or []),
            }
        await queue.put((event, payload))

    async def produce() -> None:
        store = get_api_key_store()
        charged = identity.id != "open-mode"

        try:
            if charged:
                await store.consume(identity.id)
        except MolthoodError as exc:
            # Quota is checked inside the stream rather than in a dependency so
            # the refusal arrives as an `error` event the console can render,
            # not as a failed connection with no explanation.
            await queue.put(
                ("error", {"code": exc.code, "message": exc.message, **exc.details})
            )
            await queue.put(None)
            return

        try:
            result = await engine.analyze(
                target=target.value,
                address=address,
                emitter=emit,
                owner_key_id=identity.id,
            )
            await queue.put(("result", to_response(result).model_dump(mode="json")))
        except MolthoodError as exc:
            if charged:
                await store.refund(identity.id)
            await queue.put(("error", {"code": exc.code, "message": exc.message}))
        except asyncio.CancelledError:
            # The reader left before the run finished. It never produced a
            # result they could use, so the unit goes back.
            if charged:
                await store.refund(identity.id)
            raise
        except Exception as exc:
            if charged:
                await store.refund(identity.id)
            logger.exception("stream_execution_failed", error=str(exc))
            await queue.put(("error", {"code": "internal", "message": str(exc)}))
        finally:
            await queue.put(None)

    task = asyncio.create_task(produce())

    try:
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=_HEARTBEAT_SECONDS)
            except TimeoutError:
                yield ": keep-alive\n\n"
                continue

            if item is None:
                return

            event, payload = item
            yield _sse(event, payload)
    finally:
        # Reached when the client disconnects mid-run. Without this the
        # execution would keep working — and keep spending credit — for a
        # reader who has already closed the tab.
        if not task.done():
            task.cancel()
        await asyncio.gather(task, return_exceptions=True)


@router.get(
    "/stream",
    summary="Run an analysis and stream its progress",
    response_class=StreamingResponse,
    description=(
        "Server-sent events for one analysis. Emits `stage_started`, "
        "`stage_finished`, `evidence_ready`, `summary_delta`, and finally "
        "`result` — the same object the REST routes return."
    ),
)
async def stream_analysis(
    engine: EngineDep,
    identity: CurrentKey,
    target: AnalysisTarget = Query(description="What kind of subject to analyse."),
    subject: str | None = Query(
        default=None,
        description="A 0x address, or a URL when target is `site`. Omit for `project`.",
    ),
) -> StreamingResponse:
    address = await _resolve_address(target, subject)

    return StreamingResponse(
        _events(engine, target, address, identity),
        media_type="text/event-stream",
        headers={
            "cache-control": "no-cache, no-transform",
            "connection": "keep-alive",
            # nginx buffers proxied responses by default, which would hold every
            # event until the run finished and defeat the entire endpoint.
            "x-accel-buffering": "no",
        },
    )
