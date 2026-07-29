"""`/api/v1/tasks` — submit one task, get one structured report.

The whole provider layer exists to serve this route. A request arrives, the
router classifies it, the manager resolves who can serve each step, the steps
run in parallel where nothing depends on anything, and a `Report` comes back
carrying what was found, where it came from, and — just as importantly — what
did not run and why.

Metered like every other route that spends money. Exa, Tavily, Firecrawl and
E2B all bill per call, so a task costs the caller a unit of their daily
allowance exactly as a chain analysis does.
"""

from __future__ import annotations

from fastapi import APIRouter, Path, Query, status
from pydantic import Field

from app.api.auth import CurrentKey
from app.core.exceptions import NotFoundError
from app.providers.orchestrator import get_orchestrator
from app.repositories.api_keys import get_api_key_store
from app.schemas.common import SchemaBase
from app.schemas.report import Report

router = APIRouter(tags=["tasks"])


class TaskCreate(SchemaBase):
    request: str = Field(
        min_length=3,
        max_length=4000,
        description="What to do. The router infers the kind from the text.",
        examples=["research the history of stablecoin depegs"],
    )
    use_cache: bool = Field(
        default=True,
        description=(
            "Reuse an identical recent task instead of re-running it. Set false "
            "to force fresh provider calls — which costs credit again."
        ),
    )


@router.post(
    "",
    response_model=Report,
    status_code=status.HTTP_200_OK,
    summary="Run a task and return a structured report",
    description=(
        "Classifies the request, resolves its workflow against the providers "
        "that exist on this deployment, runs the steps, and returns the "
        "report. A step with no provider is reported as skipped with the "
        "variable that would enable it — never silently omitted.\n\n"
        "Costs one unit of the key's daily analysis allowance."
    ),
)
async def create_task(payload: TaskCreate, identity: CurrentKey) -> Report:
    store = get_api_key_store()
    charged = identity.id != "open-mode"

    if charged:
        await store.consume(identity.id)

    try:
        report = await get_orchestrator().run(
            payload.request, use_cache=payload.use_cache, owner=identity.id
        )
    except Exception:
        if charged:
            await store.refund(identity.id)
        raise

    # A report served from cache called no provider and cost nothing, so the
    # unit goes back. Charging for a cache hit would penalise the caller for
    # the platform being efficient.
    if charged and (report.performance.cache_hit or not report.performance.steps_run):
        await store.refund(identity.id)

    return report


@router.get(
    "/{task_id}",
    response_model=Report,
    summary="Retrieve a finished report",
    description=(
        "Reports are held for 24 hours in the cache layer, so a link to one "
        "outlives the window in which an identical request would be re-run. "
        "They are not stored permanently — a report older than that has to be "
        "produced again."
    ),
)
async def get_task(
    identity: CurrentKey,
    task_id: str = Path(description="Task id returned by POST /tasks."),
) -> Report:
    report = await get_orchestrator().get(task_id)

    if report is None:
        raise NotFoundError(
            f"No report found with id '{task_id}'.",
            details={"task_id": task_id},
            suggested_action=(
                "Reports are kept for 24 hours. Run the task again to produce "
                "a fresh one."
            ),
        )

    return report


@router.get(
    "/preview/plan",
    summary="Show how a request would run, without running it",
    description=(
        "Classification and step resolution only. Nothing is called and "
        "nothing is charged, so a caller can see which providers would be used "
        "and what would be skipped before spending anything."
    ),
)
async def preview(
    identity: CurrentKey,
    request: str = Query(min_length=3, max_length=4000),
) -> dict[str, object]:
    from app.providers.inputs import extract
    from app.providers.manager import get_provider_manager
    from app.providers.workflows import classify, plan

    kind = classify(request)
    resolved = plan(kind, get_provider_manager())
    task_input = extract(request)

    return {
        "request": request,
        "classified_as": kind.value,
        "extracted": {
            "query": task_input.query,
            "url": task_input.url,
            "has_code": task_input.code is not None,
        },
        "plan": resolved.to_dict(),
    }
