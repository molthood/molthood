"""`/api/v1/status` — what is registered and what is actually reachable."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import (
    AgentRegistryDep,
    ExecutionStoreDep,
    PipelineRegistryDep,
    ServiceRegistryDep,
    SettingsDep,
)
from app.api.system import uptime_seconds
from app.schemas.system import (
    ComponentStatus,
    DependencyStatus,
    StatusResponse,
    WebCapability,
)
from app.services.web.registry import get_web_registry
from app.utils.time import utcnow

router = APIRouter(tags=["status"])

#: Human explanation for each dependency state returned by the registry probe.
_STATE_DETAIL = {
    "live": "Responding to real requests.",
    "not_configured": "No API key configured; this service is disabled.",
    "unavailable": "Configured but not reachable right now.",
}


@router.get(
    "",
    response_model=StatusResponse,
    summary="Platform status",
    description=(
        "Probes every configured dependency in parallel. A service is reported "
        "`live` only if it actually answered."
    ),
)
async def status(
    settings: SettingsDep,
    agents: AgentRegistryDep,
    pipelines: PipelineRegistryDep,
    services: ServiceRegistryDep,
    store: ExecutionStoreDep,
) -> StatusResponse:
    health = await services.health()

    implemented = [agent for agent in agents.list() if agent.implemented]

    components = [
        ComponentStatus(
            name="agent_registry",
            ready=len(implemented) > 0,
            detail=(f"{len(implemented)} of {len(agents.list())} agents implemented."),
        ),
        ComponentStatus(
            name="pipeline_registry",
            ready=len(pipelines.list()) > 0,
            detail=f"{len(pipelines.list())} pipelines registered.",
        ),
        ComponentStatus(
            name="execution_engine",
            ready=True,
            detail=f"{store.count()} executions run since this process started.",
        ),
        ComponentStatus(
            name="ai_summarizer",
            ready=health.get("openrouter", {}).get("state") == "live",
            detail=(
                "Ready."
                if health.get("openrouter", {}).get("state") == "live"
                else "Requires OPENROUTER_API_KEY; executions still return evidence."
            ),
        ),
        ComponentStatus(
            name="persistence",
            ready=False,
            detail="No database in this phase; execution history is in-memory only.",
        ),
    ]

    dependencies = [
        DependencyStatus(
            name=name,
            state=state["state"],
            detail=_STATE_DETAIL.get(state["state"], state.get("detail", "")),
        )
        for name, state in health.items()
    ]

    core_live = all(
        health.get(name, {}).get("state") == "live"
        for name in ("robinhood_rpc", "blockscout")
    )

    web_capabilities = [
        WebCapability(**capability) for capability in get_web_registry().describe()
    ]

    return StatusResponse(
        web_intelligence=web_capabilities,
        status="ok" if core_live else "degraded",
        environment=settings.app_env,
        version=settings.app_version,
        uptime_seconds=uptime_seconds(),
        timestamp=utcnow(),
        agents_registered=len(agents.list()),
        pipelines_registered=len(pipelines.list()),
        components=components,
        dependencies=dependencies,
    )
