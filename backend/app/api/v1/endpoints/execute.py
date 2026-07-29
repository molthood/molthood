"""Execution endpoints.

Every route here delegates to the execution engine. None of them calls an
external service directly, and none contains a workflow — the router decides
what to run.

All of them are metered. An analysis spends real inference credit, so the
caller's daily allowance is charged before the work starts and refunded if the
work never happened — a rejected address costs nothing and must not bill.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import APIRouter, Path, Query, status

from app.api.auth import CurrentKey
from app.api.deps import EngineDep
from app.core.exceptions import UnresolvableHostError
from app.engine.context import ExecutionRequest
from app.engine.result import ExecutionResult
from app.repositories.api_keys import KeyIdentity, get_api_key_store
from app.schemas.execution import ExecutionCreate, ExecutionResponse
from app.services.web.fetcher import normalize_url, validate_public_url_async
from app.utils.validation import validate_address

router = APIRouter(tags=["execution"])

ADDRESS_PATH = Path(
    description="A 42-character hex address on Robinhood Chain.",
    examples=["0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34"],
)


#: Task fields exposed to clients. `output` is deliberately excluded — it
#: duplicates `facts`, and repeating it would double the payload.
_TASK_FIELDS = ("id", "sequence", "name", "agent_kind", "status", "duration_ms", "error")


def to_response(result: ExecutionResult) -> ExecutionResponse:
    """Project the engine's result onto the public response schema."""
    tasks = [
        {key: task[key] for key in _TASK_FIELDS if key in task} for task in result.tasks
    ]

    return ExecutionResponse(
        execution_id=result.execution_id,
        status=result.status,
        stage=result.stage,
        target=result.target,
        address=result.address,
        agents_used=result.agents_used,
        services_called=result.services_called,
        summary=result.summary,
        summary_status=result.summary_status,
        summary_detail=result.summary_detail,
        summary_model=result.summary_model,
        facts=result.facts,
        evidence=result.evidence,
        sources=result.sources,
        stages=[stage.to_dict() for stage in result.stages],
        tasks=tasks,
        execution_time_ms=result.execution_time_ms,
        error=result.error,
    )


async def metered(
    identity: KeyIdentity, run: Callable[[], Awaitable[ExecutionResult]]
) -> ExecutionResponse:
    """Charge one analysis, run it, and give the unit back if it never ran.

    The refund is the part that matters. Charging in a dependency would be
    simpler, but then a mistyped address — rejected before a single service
    call — would still cost the caller a unit of a fifty-a-day allowance.
    """
    store = get_api_key_store()
    charged = identity.id != "open-mode"

    if charged:
        await store.consume(identity.id)

    try:
        result = await run()
    except Exception:
        if charged:
            await store.refund(identity.id)
        raise

    # A run that failed inside the pipeline still called services and still
    # cost time upstream, so it stays charged. Only a request that never
    # started is refunded.
    return to_response(result)


@router.post(
    "/execute",
    response_model=ExecutionResponse,
    status_code=status.HTTP_200_OK,
    summary="Submit a request for execution",
    description=(
        "Runs a free-form request through the pipeline. The router infers the "
        "target from the text — pass `metadata.target` to be explicit."
    ),
)
async def execute(
    payload: ExecutionCreate, engine: EngineDep, identity: CurrentKey
) -> ExecutionResponse:
    return await metered(
        identity,
        lambda: engine.submit(
            ExecutionRequest(
                request=payload.request,
                project_id=payload.project_id,
                pipeline=payload.pipeline,
                metadata=payload.metadata,
            ),
            owner_key_id=identity.id,
        ),
    )


@router.get(
    "/token/{address}",
    response_model=ExecutionResponse,
    summary="Analyze a token",
)
async def analyze_token(
    engine: EngineDep, identity: CurrentKey, address: str = ADDRESS_PATH
) -> ExecutionResponse:
    validated = validate_address(address)
    return await metered(
        identity,
        lambda: engine.analyze(
            target="token", address=validated, owner_key_id=identity.id
        ),
    )


@router.get(
    "/wallet/{address}",
    response_model=ExecutionResponse,
    summary="Analyze a wallet",
)
async def analyze_wallet(
    engine: EngineDep, identity: CurrentKey, address: str = ADDRESS_PATH
) -> ExecutionResponse:
    validated = validate_address(address)
    return await metered(
        identity,
        lambda: engine.analyze(
            target="wallet", address=validated, owner_key_id=identity.id
        ),
    )


@router.get(
    "/contract/{address}",
    response_model=ExecutionResponse,
    summary="Analyze a contract",
)
async def analyze_contract(
    engine: EngineDep, identity: CurrentKey, address: str = ADDRESS_PATH
) -> ExecutionResponse:
    validated = validate_address(address)
    return await metered(
        identity,
        lambda: engine.analyze(
            target="contract", address=validated, owner_key_id=identity.id
        ),
    )


@router.get(
    "/project",
    response_model=ExecutionResponse,
    summary="Analyze the chain",
    description="A network-level overview of Robinhood Chain.",
)
async def analyze_project(engine: EngineDep, identity: CurrentKey) -> ExecutionResponse:
    return await metered(
        identity, lambda: engine.analyze(target="project", owner_key_id=identity.id)
    )


@router.get(
    "/site",
    response_model=ExecutionResponse,
    summary="Analyze a website",
    description=(
        "Off-chain intelligence for a project's public presence: published "
        "policies, DNS and mail posture, domain registration, and archive "
        "history. Every source is a public endpoint; none requires a key."
    ),
)
async def analyze_site(
    engine: EngineDep,
    identity: CurrentKey,
    url: str = Query(
        description="A website URL or bare domain.",
        examples=["https://robinhood.com"],
    ),
) -> ExecutionResponse:
    # A private or malformed host is a caller error and is rejected here. A
    # domain that does not resolve is not — that is a finding, and the agent
    # reports it alongside whatever registration and archive history exists.
    try:
        validated = await validate_public_url_async(url)
    except UnresolvableHostError:
        validated = normalize_url(url)

    return await metered(
        identity,
        lambda: engine.analyze(
            target="site", address=validated, owner_key_id=identity.id
        ),
    )
