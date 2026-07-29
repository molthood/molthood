"""Core application wiring: errors and constants.

`lifespan` is deliberately **not** re-exported here. It imports the agent
registry, which imports `app.core.exceptions` — re-exporting it would make
`import app.core.exceptions` pull in the agent package and create a cycle.
Import it from `app.core.lifespan` directly.
"""

from app.core.errors import register_exception_handlers
from app.core.exceptions import (
    AgentError,
    AgentNotRegisteredError,
    ConflictError,
    EngineError,
    MolthoodError,
    NotFoundError,
    NotImplementedYetError,
    ServiceUnavailableError,
    ValidationError,
)

__all__ = [
    "AgentError",
    "AgentNotRegisteredError",
    "ConflictError",
    "EngineError",
    "MolthoodError",
    "NotFoundError",
    "NotImplementedYetError",
    "ServiceUnavailableError",
    "ValidationError",
    "register_exception_handlers",
]
