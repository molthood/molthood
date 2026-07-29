"""`/api/v1/providers` — what this deployment can currently do.

Read without a credential on purpose. A caller deciding whether to bother
authenticating needs to know first whether the capability they want exists
here, and an operator diagnosing a missing key should not need a key to see
that it is missing.

Nothing on this surface reveals a secret: only whether one is present, and the
name of the variable that would supply it.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from app.providers.manager import ProviderManager, get_provider_manager
from app.providers.workflows import WORKFLOWS, TaskKind, classify, plan

router = APIRouter(tags=["providers"])


def _manager() -> ProviderManager:
    return get_provider_manager()


@router.get(
    "",
    summary="Every provider and its current state",
    description=(
        "States are `healthy`, `enabled`, `missing_key`, `disabled`, "
        "`rate_limited`, or `unavailable`. They are not interchangeable: a "
        "missing key is a deployment task, a rate limit clears on its own, and "
        "unavailable is an upstream outage."
    ),
)
async def list_providers(
    refresh: bool = Query(
        default=False, description="Re-probe now instead of using the cached result."
    ),
) -> dict[str, Any]:
    manager = _manager()
    if refresh:
        await manager.refresh(force=True)
    return manager.snapshot()


@router.get(
    "/workflows",
    summary="The workflows this deployment can run",
    description=(
        "Each workflow resolved against the providers that exist right now. A "
        "workflow with an unserved required step reports `runnable: false` and "
        "names the variables that would fix it."
    ),
)
async def list_workflows() -> dict[str, Any]:
    manager = _manager()
    return {
        "items": [
            {
                **plan(kind, manager).to_dict(),
                "description": WORKFLOWS[kind].description,
            }
            for kind in TaskKind
        ]
    }


@router.get(
    "/plan",
    summary="Show how a request would be routed",
    description=(
        "Classifies the request and resolves its workflow without executing "
        "anything — so a caller can see which providers would be used, and "
        "which steps would be skipped, before spending anything."
    ),
)
async def preview_plan(
    request: str = Query(
        min_length=3, max_length=2000, description="The task to classify."
    ),
) -> dict[str, Any]:
    manager = _manager()
    kind = classify(request)
    resolved = plan(kind, manager)

    return {
        "request": request,
        "classified_as": kind.value,
        "plan": resolved.to_dict(),
    }
