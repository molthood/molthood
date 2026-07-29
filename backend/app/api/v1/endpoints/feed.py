"""`/api/v1/feed` — the public execution feed.

The only surface on this platform readable with no credential at all, which is
why it is the one place where what gets *left out* matters more than what goes
in. Nothing here identifies a subject and nothing names a supplier; see
`schemas.public_feed` for the redaction and the reasoning behind it.

An execution appears here only because its owner published it. Nothing is
opted in by default, so an empty feed is the honest and expected state of a
new deployment rather than a bug to work around.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Path, Query, status
from fastapi.responses import StreamingResponse

from app.api.auth import CurrentKey
from app.api.deps import ExecutionStoreDep
from app.core.exceptions import NotFoundError
from app.logging import get_logger
from app.schemas.public_feed import PublicExecution, to_public

logger = get_logger(__name__)

router = APIRouter(tags=["feed"])

#: How often the live stream re-reads the feed. Long enough that an idle page
#: is not a load generator, short enough to feel live.
_POLL_SECONDS = 3.0

#: Sent between polls so a proxy does not close an idle connection.
_KEEPALIVE_SECONDS = 20.0


@router.get(
    "",
    response_model=list[PublicExecution],
    summary="Executions their owners chose to publish",
    description=(
        "Readable without a credential. Carries the kind of work, its phases, "
        "and its progress — never the subject and never the providers used."
    ),
)
async def public_feed(
    store: ExecutionStoreDep,
    limit: int = Query(default=12, ge=1, le=50),
) -> list[PublicExecution]:
    return [to_public(row) for row in store.public_feed(limit=limit)]


@router.get(
    "/stream",
    summary="The same feed, streamed",
    response_class=StreamingResponse,
    description=(
        "Server-sent events. Emits the feed on connect and again whenever it "
        "changes, so a page stays current without polling from the browser."
    ),
)
async def stream_feed(
    store: ExecutionStoreDep,
    limit: int = Query(default=12, ge=1, le=50),
) -> StreamingResponse:
    async def events() -> AsyncIterator[str]:
        previous: str | None = None
        idle = 0.0

        while True:
            # Read off the event loop: the session is synchronous, and one
            # slow read would stall every other request on this worker.
            rows = await asyncio.to_thread(store.public_feed, limit=limit)
            payload = json.dumps(
                [to_public(row).model_dump(mode="json") for row in rows],
                default=str,
            )

            if payload != previous:
                previous = payload
                idle = 0.0
                yield f"event: feed\ndata: {payload}\n\n"
            else:
                idle += _POLL_SECONDS
                if idle >= _KEEPALIVE_SECONDS:
                    idle = 0.0
                    yield ": keep-alive\n\n"

            await asyncio.sleep(_POLL_SECONDS)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "cache-control": "no-cache, no-transform",
            "connection": "keep-alive",
            # nginx buffers proxied responses by default, which would hold
            # every event until the stream ended.
            "x-accel-buffering": "no",
        },
    )


@router.post(
    "/{execution_id}/publish",
    status_code=status.HTTP_200_OK,
    summary="Publish one of your executions to the feed",
    description=(
        "Opt-in, and reversible. An execution records the subject it was about, "
        "so nothing is published unless the key that ran it says so."
    ),
)
async def publish(
    store: ExecutionStoreDep,
    identity: CurrentKey,
    execution_id: str = Path(description="Execution id returned by an analysis."),
    public: bool = Query(default=True, description="False to unpublish."),
) -> dict[str, Any]:
    if not store.publish(execution_id, identity.id, public):
        # One message whether it is missing or simply not theirs: distinguishing
        # them would confirm to a prober that an id exists.
        raise NotFoundError(
            f"No execution found with id '{execution_id}'.",
            details={"execution_id": execution_id},
            suggested_action="Check the id, or run the analysis again.",
        )

    logger.info("execution_publish_changed", execution=execution_id, public=public)
    return {"id": execution_id, "public": public}
