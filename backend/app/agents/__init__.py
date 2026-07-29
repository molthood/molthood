"""Agent system.

`BaseAgent` defines the contract; each subpackage holds one agent. Phase 3
ships the architecture only — no agent performs work.
"""

from app.agents.base import AgentMetadata, BaseAgent
from app.agents.registry import AGENT_PACKAGES, AgentRegistry, agent_registry

__all__ = [
    "AGENT_PACKAGES",
    "AgentMetadata",
    "AgentRegistry",
    "BaseAgent",
    "agent_registry",
]
