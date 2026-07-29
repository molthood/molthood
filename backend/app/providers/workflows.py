"""Routing a task to the providers that can serve it.

Deliberately *not* "call everything and merge". Each workflow is an ordered
sequence of capabilities, and each capability is served by the best available
provider — so a research task with no Exa key still runs on Tavily, and one
with no search keys at all fails with a list of the variables that would fix
it rather than an empty report.

Adding a provider means one entry in `manager.PREFERENCE`. Adding a workflow
means one entry here. Neither requires touching the execution code below.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from app.logging import get_logger
from app.providers.manager import ProviderManager
from app.providers.types import Capability, ProviderResult

logger = get_logger(__name__)


class TaskKind(StrEnum):
    """What the user is asking for."""

    RESEARCH = "research"
    WEBSITE_AUDIT = "website_audit"
    REPOSITORY_ANALYSIS = "repository_analysis"
    CODE_EXECUTION = "code_execution"
    QUESTION = "question"


@dataclass(frozen=True, slots=True)
class Step:
    """One capability a workflow needs, and how much it matters."""

    capability: Capability
    #: When True, the workflow cannot produce a useful result without it.
    #: Everything else is enrichment and is skipped when unavailable.
    required: bool = False
    description: str = ""
    #: True when this step consumes URLs produced by earlier steps rather than
    #: the original request. It is what splits a workflow into two phases: the
    #: independent steps run together, and these run once their inputs exist.
    #: Without the distinction, "read the strongest sources" would run before
    #: anything had found any.
    needs_results: bool = False


@dataclass(frozen=True, slots=True)
class Workflow:
    kind: TaskKind
    title: str
    description: str
    steps: tuple[Step, ...]

    @property
    def required_capabilities(self) -> tuple[Capability, ...]:
        return tuple(step.capability for step in self.steps if step.required)


#: The workflow table. Order is the plan; `required` decides whether a missing
#: provider degrades the result or stops it.
WORKFLOWS: dict[TaskKind, Workflow] = {
    TaskKind.RESEARCH: Workflow(
        kind=TaskKind.RESEARCH,
        title="Research",
        description="Gather and cite sources on a topic.",
        steps=(
            Step(Capability.SEMANTIC_SEARCH, description="Find sources by meaning."),
            Step(
                Capability.WEB_SEARCH,
                required=True,
                description="Rank sources for the query.",
            ),
            Step(Capability.NEWS_SEARCH, description="Add recent coverage."),
            Step(
                Capability.READ_URL,
                description="Read the strongest sources.",
                needs_results=True,
            ),
        ),
    ),
    TaskKind.WEBSITE_AUDIT: Workflow(
        kind=TaskKind.WEBSITE_AUDIT,
        title="Website audit",
        description="Read a site, follow its pages, and see how it presents itself.",
        steps=(
            Step(
                Capability.READ_URL,
                required=True,
                description="Read the landing page.",
            ),
            Step(Capability.CRAWL_SITE, description="Follow the rest of the site."),
            Step(Capability.SCREENSHOT, description="Capture how it renders."),
            Step(Capability.WEB_SEARCH, description="See how it is described elsewhere."),
        ),
    ),
    TaskKind.REPOSITORY_ANALYSIS: Workflow(
        kind=TaskKind.REPOSITORY_ANALYSIS,
        title="Repository analysis",
        description="Read a repository and what is written about it.",
        steps=(
            Step(
                Capability.READ_URL,
                required=True,
                description="Read the repository page.",
            ),
            Step(Capability.WEB_SEARCH, description="Find discussion and documentation."),
            Step(Capability.SIMILAR_PAGES, description="Find comparable projects."),
        ),
    ),
    TaskKind.CODE_EXECUTION: Workflow(
        kind=TaskKind.CODE_EXECUTION,
        title="Code execution",
        description="Run code in a sandbox and collect what it produced.",
        steps=(
            Step(
                Capability.RUN_CODE,
                required=True,
                description="Execute in a disposable sandbox.",
            ),
        ),
    ),
    TaskKind.QUESTION: Workflow(
        kind=TaskKind.QUESTION,
        title="Question",
        description="Answer directly, with search only where it helps.",
        steps=(Step(Capability.WEB_SEARCH, description="Ground the answer in sources."),),
    ),
}


#: Signals that a request is one kind rather than another. Checked in the order
#: listed, so the most specific match wins.
_URL = re.compile(r"https?://\S+|(?:[\w-]+\.)+[a-z]{2,}(?:/\S*)?", re.IGNORECASE)
_REPO = re.compile(r"github\.com/[\w.-]+/[\w.-]+|gitlab\.com/[\w.-]+/[\w.-]+", re.I)
_CODE_WORDS = (
    "run this code",
    "execute",
    "calculate",
    "plot",
    "chart",
    "compute",
    "```",
)
_AUDIT_WORDS = ("audit", "review the site", "check the website", "analyse the site")
_RESEARCH_WORDS = ("research", "find sources", "investigate", "compare", "survey")


def classify(request: str) -> TaskKind:
    """Decide what kind of task a free-form request is.

    Rule-based rather than model-based on purpose: classification runs before
    any provider is chosen, so it must work on a deployment with no keys at
    all. A model-based classifier would make routing itself depend on the
    thing it is routing to.
    """
    text = request.strip()
    lowered = text.lower()

    if _REPO.search(text):
        return TaskKind.REPOSITORY_ANALYSIS

    if any(word in lowered for word in _CODE_WORDS):
        return TaskKind.CODE_EXECUTION

    if _URL.search(text):
        # A URL plus an audit word is an audit; a URL alone is still a site to
        # look at, which is the same workflow.
        return TaskKind.WEBSITE_AUDIT

    if any(word in lowered for word in _AUDIT_WORDS):
        return TaskKind.WEBSITE_AUDIT

    if any(word in lowered for word in _RESEARCH_WORDS):
        return TaskKind.RESEARCH

    return TaskKind.QUESTION


@dataclass(slots=True)
class PlannedStep:
    """One step, resolved against what is actually available."""

    capability: Capability
    provider: str | None
    required: bool
    description: str
    needs_results: bool = False
    skipped_because: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "capability": self.capability.value,
            "provider": self.provider,
            "required": self.required,
            "description": self.description,
            "needs_results": self.needs_results,
            "skipped_because": self.skipped_because,
        }


@dataclass(slots=True)
class Plan:
    """A workflow resolved against the current provider state."""

    kind: TaskKind
    title: str
    steps: list[PlannedStep] = field(default_factory=list)
    #: Variables that would enable a required step nothing can serve.
    blocked_by: list[str] = field(default_factory=list)

    @property
    def runnable(self) -> bool:
        """Whether every required step has a provider."""
        return not any(step.required and step.provider is None for step in self.steps)

    @property
    def active_steps(self) -> list[PlannedStep]:
        return [step for step in self.steps if step.provider is not None]

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind.value,
            "title": self.title,
            "runnable": self.runnable,
            "blocked_by": self.blocked_by,
            "steps": [step.to_dict() for step in self.steps],
        }


def plan(kind: TaskKind, manager: ProviderManager) -> Plan:
    """Resolve a workflow against the providers that exist right now.

    Produces the whole plan including skipped steps, each with the reason it
    was skipped. A report that silently omitted a step would leave a reader
    unable to tell thorough coverage from a missing key.
    """
    workflow = WORKFLOWS[kind]
    resolved = Plan(kind=kind, title=workflow.title)

    for step in workflow.steps:
        provider = manager.best_for(step.capability)

        if provider is not None:
            resolved.steps.append(
                PlannedStep(
                    capability=step.capability,
                    provider=provider.name,
                    required=step.required,
                    description=step.description,
                    needs_results=step.needs_results,
                )
            )
            continue

        missing = manager.missing_for(step.capability)
        reason = (
            f"No provider available. Set {', '.join(missing)} to enable this."
            if missing
            else "No provider offers this capability on this deployment."
        )
        resolved.steps.append(
            PlannedStep(
                capability=step.capability,
                provider=None,
                required=step.required,
                description=step.description,
                needs_results=step.needs_results,
                skipped_because=reason,
            )
        )
        if step.required:
            resolved.blocked_by.extend(missing)

    # Deduplicate while keeping order, so the console lists each variable once.
    resolved.blocked_by = list(dict.fromkeys(resolved.blocked_by))
    return resolved


async def execute_step(
    step: PlannedStep, manager: ProviderManager, /, **kwargs: Any
) -> ProviderResult | None:
    """Run one planned step. Returns None for a step that was skipped."""
    if step.provider is None:
        return None

    provider = manager.get(step.provider)
    if provider is None:
        return None

    result = await provider.execute(step.capability, **kwargs)

    logger.info(
        "workflow_step",
        capability=step.capability.value,
        provider=step.provider,
        ok=result.ok,
        duration_ms=result.duration_ms,
    )
    return result
