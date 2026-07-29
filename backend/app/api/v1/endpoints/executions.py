"""`/api/v1/executions` — the runs performed by the calling key.

Durable, and scoped. An execution outlives the process that produced it, which
is what makes a shared link to one worth having — but it also records what its
owner asked about, and a wallet address is not something to publish on a list
every visitor can read.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Path, Query

from app.api.auth import CurrentKey
from app.api.deps import ExecutionStoreDep, PaginationDep
from app.core.exceptions import NotFoundError
from app.repositories.api_keys import KeyIdentity
from app.schemas.execution import ExecutionResponse

router = APIRouter(tags=["executions"])

PERSISTENCE_NOTE = (
    "Stored in the configured database and durable across restarts. "
    "Scoped to the API key that ran them."
)


def _scope(identity: KeyIdentity) -> str | None:
    """Which owner to filter by, or None to see everything.

    An admin key reads the whole table; that is the point of it. Open mode —
    `AUTH_REQUIRED=false` — also reads everything, because with no keys there
    is nothing to scope by. Both are unsuitable for a public deployment, and
    both are opt-in.
    """
    return None if identity.is_admin else identity.id


@router.get("", summary="List your recent executions")
async def list_executions(
    store: ExecutionStoreDep,
    pagination: PaginationDep,
    identity: CurrentKey,
    status: str | None = Query(default=None, description="Filter by status."),
) -> dict[str, Any]:
    owner = _scope(identity)
    records = store.all(owner)

    if status is not None:
        records = [record for record in records if record.status == status]

    window = records[pagination.offset : pagination.offset + pagination.limit]

    return {
        "items": [record.to_dict() for record in window],
        "meta": {
            "total": len(records),
            "page": pagination.page,
            "page_size": pagination.page_size,
        },
        "persistence": PERSISTENCE_NOTE,
        "stats": store.stats(owner),
    }


@router.get(
    "/subjects",
    summary="Everything you have analysed, grouped by subject",
    description=(
        "Derived from your executions rather than stored separately. A subject "
        "appears here as soon as it has been analysed once, and carries its "
        "latest risk score and whatever changed at the most recent check."
    ),
)
async def list_subjects(store: ExecutionStoreDep, identity: CurrentKey) -> dict[str, Any]:
    subjects = store.subjects(_scope(identity))
    return {
        "items": subjects,
        "total": len(subjects),
        # Named so the console can lead with the ones worth returning to.
        "revisited": sum(1 for item in subjects if item["runs"] > 1),
    }


@router.get("/{execution_id}", summary="Retrieve one execution")
async def get_execution(
    store: ExecutionStoreDep,
    identity: CurrentKey,
    execution_id: str = Path(description="Execution id returned by /execute."),
) -> dict[str, Any]:
    record = store.get(execution_id, _scope(identity))

    if record is None:
        raise _not_found(execution_id)

    return record.to_dict()


@router.get(
    "/{execution_id}/result",
    response_model=ExecutionResponse,
    summary="Retrieve a stored execution in full",
    description=(
        "The complete result — evidence, sources, and summary — exactly as the "
        "original analysis returned it. This is what a shared link renders, so "
        "a reader sees the findings and not a re-run against a moved chain."
    ),
)
async def get_execution_result(
    store: ExecutionStoreDep,
    identity: CurrentKey,
    execution_id: str = Path(description="Execution id returned by /execute."),
) -> ExecutionResponse:
    from app.api.v1.endpoints.execute import to_response

    result = store.get_result(execution_id, _scope(identity))

    if result is None:
        raise _not_found(execution_id)

    return to_response(result)


def _not_found(execution_id: str) -> NotFoundError:
    """One message whether the run is missing or simply not the caller's.

    Distinguishing them would turn this endpoint into an oracle for whether a
    given execution id exists on the platform at all.
    """
    return NotFoundError(
        f"No execution found with id '{execution_id}'.",
        details={"execution_id": execution_id},
        suggested_action="Check the id, or run the analysis again.",
    )
