"""Agent registry.

Discovers agent packages, instantiates one instance per kind, and hands them
to the engine on demand.
"""

from __future__ import annotations

import importlib
import pkgutil
from typing import Final

from app.agents.base import BaseAgent
from app.core.exceptions import AgentNotRegisteredError
from app.logging import get_logger
from app.models.enums import AgentKind

logger = get_logger(__name__)

#: Package each agent lives in, relative to `app.agents`.
AGENT_PACKAGES: Final[tuple[str, ...]] = (
    "launch",
    "market",
    "project",
    "contract",
    "risk",
    "builder",
    "portfolio",
    "community",
    "site",
)


class AgentRegistry:
    """Holds exactly one instance of each registered agent."""

    def __init__(self) -> None:
        self._agents: dict[AgentKind, BaseAgent] = {}
        self._loaded = False

    def register(self, agent: BaseAgent) -> None:
        self._agents[agent.kind] = agent

    def autoload(self) -> None:
        """Import every agent package and register what it exposes.

        Idempotent — the lifespan hook and the tests may both call it.
        """
        if self._loaded:
            return

        package = importlib.import_module("app.agents")

        for module_info in pkgutil.iter_modules(package.__path__):
            if not module_info.ispkg or module_info.name not in AGENT_PACKAGES:
                continue

            module = importlib.import_module(f"app.agents.{module_info.name}")
            agent_cls = getattr(module, "AGENT", None)

            if agent_cls is None or not issubclass(agent_cls, BaseAgent):
                logger.warning("agent_package_skipped", package=module_info.name)
                continue

            self.register(agent_cls())

        self._loaded = True
        logger.info("agent_registry_loaded", count=len(self._agents))

    def get(self, kind: AgentKind) -> BaseAgent:
        # Load on demand so any entry point — app, script, worker, test — gets
        # a populated registry without having to remember to prime it.
        self.autoload()

        agent = self._agents.get(kind)
        if agent is None:
            raise AgentNotRegisteredError(
                f"No agent registered for '{kind.value}'.",
                details={"kind": kind.value},
            )
        return agent

    def list(self) -> list[BaseAgent]:
        """Registered agents, in the declared package order."""
        self.autoload()
        order = {kind: index for index, kind in enumerate(AgentKind)}
        return sorted(self._agents.values(), key=lambda agent: order[agent.kind])

    def __contains__(self, kind: object) -> bool:
        return kind in self._agents


#: Process-wide registry, populated during application startup.
agent_registry = AgentRegistry()
