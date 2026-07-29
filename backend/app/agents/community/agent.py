"""Community Agent — architecture only.

Drafts, schedules, and evidences external communication tied to real execution
events.
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


class CommunityAgent(BaseAgent):
    """Community Agent.

    Phase 3 defines the agent's identity, capabilities, and dependencies. It
    performs no work — `run` raises rather than returning a fabricated result.
    """

    metadata: ClassVar[AgentMetadata] = AgentMetadata(
        kind=AgentKind.COMMUNITY,
        name="Community Agent",
        description=(
            "Drafts, schedules, and evidences external communication tied "
            "to real execution events."
        ),
        version="0.1.0",
        capabilities=("event_triggers", "draft_generation", "publish_log"),
    )

    implemented: ClassVar[bool] = False

    async def run(self, task: Task, context: ExecutionContext) -> AgentResult:
        raise NotImplementedYetError(
            "Community Agent is not implemented yet.",
            details={
                "agent": AgentKind.COMMUNITY.value,
                "task": task.name,
                "execution_id": context.execution_id,
                "requires_services": list(REQUIRED_SERVICES),
                "enabled_in": "phase_4",
            },
        )


#: Discovered by `AgentRegistry.autoload`.
AGENT = CommunityAgent
