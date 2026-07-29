"""Domain enumerations shared by ORM models, schemas, and the engine."""

from __future__ import annotations

from enum import StrEnum


class AgentStatus(StrEnum):
    ACTIVE = "active"
    IDLE = "idle"
    PAUSED = "paused"
    ERROR = "error"


class AgentKind(StrEnum):
    """Stable identifiers for every agent the platform will ship."""

    LAUNCH = "launch"
    MARKET = "market"
    PROJECT = "project"
    CONTRACT = "contract"
    RISK = "risk"
    BUILDER = "builder"
    PORTFOLIO = "portfolio"
    COMMUNITY = "community"
    #: Off-chain: a project's public web presence.
    SITE = "site"


class ExecutionStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"

    @property
    def is_terminal(self) -> bool:
        return self in {
            ExecutionStatus.SUCCEEDED,
            ExecutionStatus.FAILED,
            ExecutionStatus.CANCELLED,
        }


class PipelineStage(StrEnum):
    """The five stages every execution passes through, in order."""

    INPUT = "input"
    AGENTS = "agents"
    ENGINE = "engine"
    EVIDENCE = "evidence"
    REPORT = "report"


class EvidenceState(StrEnum):
    """How much a finding actually establishes.

    Two states are not enough. A missing value used to mean both "we checked
    and there is nothing" and "we could not check at all", and the two were
    indistinguishable once the value was dropped. That let a failed lookup
    read as a clean bill of health — the worst possible direction for a
    product whose claim is that it does not invent anything.

    Every finding must therefore say which of these it is.
    """

    #: Checked, and this is the answer. The value may legitimately be False.
    CONFIRMED = "confirmed"
    #: Checked a claim the subject makes about itself, and it does not hold.
    REFUTED = "refuted"
    #: Could not be checked. `reason` explains why, and is never optional.
    UNKNOWN = "unknown"


class TaskStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class ProjectStatus(StrEnum):
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"


class ReportCategory(StrEnum):
    AUDIT = "audit"
    MARKET = "market"
    RISK = "risk"
    DEPLOYMENT = "deployment"
    PORTFOLIO = "portfolio"


class ServiceName(StrEnum):
    ROBINHOOD_RPC = "robinhood_rpc"
    BLOCKSCOUT = "blockscout"
    CODEX = "codex"
    OPENROUTER = "openrouter"
