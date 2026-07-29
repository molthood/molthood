"""`/api/v1/agents` — the live agent registry.

Everything here is read from the running code or counted from stored runs.
Nothing is fabricated: an agent nobody has executed reports zero runs and no
timing, rather than a plausible-looking success rate.

Unauthenticated, because it describes the runtime rather than anybody's work.
That is also the constraint on what it may say about past executions — counts,
timings, and subject *kinds* only, never an address or a request.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Path

from app.api.deps import AgentRegistryDep, ExecutionStoreDep, ServiceRegistryDep
from app.core.exceptions import NotFoundError

router = APIRouter(tags=["agents"])

#: Services each agent depends on, used to derive its operational status.
_AGENT_SERVICES: dict[str, tuple[str, ...]] = {
    "market": ("blockscout",),
    "contract": ("blockscout", "robinhood_rpc"),
    "project": ("blockscout", "robinhood_rpc"),
    "risk": (),
    #: Web intelligence lives outside ServiceName, so there is nothing in the
    #: core health probe to gate this agent on — it is always available.
    "site": (),
    "launch": ("robinhood_rpc", "blockscout"),
    "builder": ("openrouter",),
    "portfolio": ("blockscout", "robinhood_rpc"),
    "community": ("openrouter",),
}


def _describe(
    agent: Any,
    health: dict[str, dict[str, Any]],
    stats: dict[str, Any] | None,
) -> dict[str, Any]:
    kind = agent.kind.value
    required = _AGENT_SERVICES.get(kind, ())

    if not agent.implemented:
        state = "not_implemented"
    elif any(health.get(name, {}).get("state") != "live" for name in required):
        state = "degraded"
    else:
        state = "active"

    runs = int(stats["runs"]) if stats else 0

    return {
        "id": kind,
        "kind": kind,
        "name": agent.metadata.name,
        "description": agent.metadata.description,
        "version": agent.metadata.version,
        "capabilities": list(agent.metadata.capabilities),
        "implemented": agent.implemented,
        "status": state,
        "required_services": list(required),
        # Each dependency with the state that produced `status` above, so a
        # degraded agent can say which dependency degraded it rather than
        # leaving the reader to guess.
        "services": [
            {
                "name": name,
                "state": health.get(name, {}).get("state", "unknown"),
                "detail": health.get(name, {}).get("detail"),
            }
            for name in required
        ],
        # Counted from stored runs, so it survives a restart.
        "runs": runs,
        "succeeded": int(stats["succeeded"]) if stats else 0,
        "failed": int(stats["failed"]) if stats else 0,
        "median_duration_ms": stats["median_duration_ms"] if stats else None,
        "last_run_at": (
            stats["last_run_at"].isoformat() if stats and stats["last_run_at"] else None
        ),
        # What this agent is actually used on, by subject kind. No addresses:
        # this endpoint is unauthenticated.
        "targets": stats["targets"] if stats else [],
    }


@router.get(
    "",
    summary="List agents",
    description=(
        "Live registry state. `status` is derived from the health of each "
        "agent's required services, not from stored metrics."
    ),
)
async def list_agents(
    registry: AgentRegistryDep,
    services: ServiceRegistryDep,
    store: ExecutionStoreDep,
) -> dict[str, Any]:
    health = await services.health()
    stats = store.agent_stats()

    items = [
        _describe(agent, health, stats.get(agent.kind.value)) for agent in registry.list()
    ]

    return {
        "items": items,
        "total": len(items),
        "implemented": sum(1 for item in items if item["implemented"]),
    }


@router.get("/{agent_id}", summary="Retrieve one agent")
async def get_agent(
    registry: AgentRegistryDep,
    services: ServiceRegistryDep,
    store: ExecutionStoreDep,
    agent_id: str = Path(description="Agent kind, e.g. 'market'."),
) -> dict[str, Any]:
    health = await services.health()

    for agent in registry.list():
        if agent.kind.value == agent_id:
            return _describe(agent, health, store.agent_stats().get(agent_id))

    raise NotFoundError(
        f"No agent registered with id '{agent_id}'.",
        details={"agent_id": agent_id},
    )
