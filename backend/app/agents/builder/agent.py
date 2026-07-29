"""Builder Agent — architecture only.

Scaffolds integrations, SDK bindings, and internal tooling against the
Molthood execution API.
"""

from __future__ import annotations

from typing import ClassVar, Final

from app.agents.base import AgentMetadata, BaseAgent
from app.core.exceptions import NotImplementedYetError
from app.engine.context import ExecutionContext
from app.engine.result import AgentResult
from app.engine.task import Task
from app.models.enums import AgentKind

#: Service clients this agent will depend on once it is implemented.
REQUIRED_SERVICES: Final[tuple[str, ...]] = ("openrouter",)


class BuilderAgent(BaseAgent):
    """Builder Agent.

    Phase 3 defines the agent's identity, capabilities, and dependencies. It
    performs no work — `run` raises rather than returning a fabricated result.
    """

    metadata: ClassVar[AgentMetadata] = AgentMetadata(
        kind=AgentKind.BUILDER,
        name="Builder Agent",
        description=(
            "Scaffolds integrations, SDK bindings, and internal tooling "
            "against the Molthood execution API."
        ),
        version="0.1.0",
        capabilities=("codegen", "integration_tests", "sdk_bindings"),
    )

    implemented: ClassVar[bool] = False

    async def run(self, task: Task, context: ExecutionContext) -> AgentResult:
        raise NotImplementedYetError(
            "Builder Agent is not implemented yet.",
            details={
                "agent": AgentKind.BUILDER.value,
                "task": task.name,
                "execution_id": context.execution_id,
                "requires_services": list(REQUIRED_SERVICES),
                "enabled_in": "phase_4",
            },
        )


#: Discovered by `AgentRegistry.autoload`.
AGENT = BuilderAgent
