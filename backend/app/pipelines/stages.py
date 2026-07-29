"""The five stages of the analysis pipeline.

    input → route → collect (service layer) → evidence → summary

These map onto the `PipelineStage` enum as INPUT, AGENTS, ENGINE, EVIDENCE and
REPORT, so the product's public five-stage vocabulary stays intact.
"""

from __future__ import annotations

import time
from collections import Counter
from typing import ClassVar

from app.agents.registry import agent_registry
from app.core.exceptions import NotImplementedYetError
from app.engine.changes import detect_changes
from app.engine.context import ExecutionContext
from app.engine.router import ExecutionRouter
from app.engine.summarizer import summarizer
from app.engine.task import Task
from app.logging import get_logger
from app.models.enums import EvidenceState, PipelineStage
from app.pipelines.base import Stage
from app.utils.validation import sanitize_request_text

logger = get_logger(__name__)


class InputStage(Stage):
    """Validates and sanitizes the incoming request."""

    stage: ClassVar[PipelineStage] = PipelineStage.INPUT

    async def run(self, context: ExecutionContext) -> str:
        cleaned = sanitize_request_text(context.request.request)
        context.request.request = cleaned
        context.output["request"] = cleaned
        return f"Accepted a {len(cleaned)}-character request."


class RouteStage(Stage):
    """Determines the analysis target and builds the agent plan."""

    stage: ClassVar[PipelineStage] = PipelineStage.AGENTS

    async def run(self, context: ExecutionContext) -> str:
        router = ExecutionRouter(services=context.services)
        decision = await router.route(context.request)
        context.routing = decision

        context.tasks = [
            Task(
                name=f"{kind.value}_analysis",
                agent_kind=kind,
                sequence=index,
                payload={"target": decision.target.value, "address": decision.address},
            )
            for index, kind in enumerate(decision.agents)
        ]

        context.output["target"] = decision.target.value
        context.output["address"] = decision.address
        context.output["agents"] = [kind.value for kind in decision.agents]

        return (
            f"Routed to {decision.target.value} analysis via "
            f"{', '.join(k.value for k in decision.agents)} ({decision.reason})."
        )


class CollectStage(Stage):
    """Runs the planned agents, which call the service layer."""

    stage: ClassVar[PipelineStage] = PipelineStage.ENGINE

    async def run(self, context: ExecutionContext) -> str:
        completed = failed = skipped = 0

        # Sequential by design: the Risk Agent reads facts the earlier agents
        # wrote. Parallelism lives *inside* each agent, across service calls.
        for task in context.tasks:
            if task.agent_kind is None:
                task.mark_skipped("No agent assigned.")
                skipped += 1
                continue

            agent = agent_registry.get(task.agent_kind)
            task.mark_running()
            started = time.perf_counter()

            try:
                result = await agent.execute(task, context)
            except NotImplementedYetError as exc:
                task.mark_skipped(exc.message)
                skipped += 1
                continue
            except Exception as exc:
                duration_ms = int((time.perf_counter() - started) * 1000)
                task.mark_failed(str(exc), duration_ms)
                failed += 1
                logger.warning(
                    "agent_task_failed",
                    agent=task.agent_kind.value,
                    error=str(exc),
                    execution_id=context.execution_id,
                )
                continue

            duration_ms = int((time.perf_counter() - started) * 1000)

            if result.success:
                task.mark_completed(result.output, duration_ms)
                completed += 1
                for finding in result.evidence:
                    context.add_evidence(
                        kind=finding.kind,
                        label=finding.label,
                        value=finding.value,
                        source_url=finding.source_url,
                        state=finding.state,
                        reason=finding.reason,
                    )
            else:
                task.mark_failed(result.error or "Agent reported failure.", duration_ms)
                failed += 1

        context.output["tasks_completed"] = completed
        context.output["tasks_failed"] = failed
        context.output["tasks_skipped"] = skipped

        if completed == 0:
            raise RuntimeError(
                "No agent produced data — the analysis has no evidence to report."
            )

        return f"{completed} completed, {failed} failed, {skipped} skipped."


class EvidenceStage(Stage):
    """Indexes what was collected and records where each fact came from."""

    stage: ClassVar[PipelineStage] = PipelineStage.EVIDENCE

    async def run(self, context: ExecutionContext) -> str:
        # This filter used to be `item.value is not None`, which deleted every
        # failed check along with every empty one. A lookup that could not run
        # then looked identical to a subject with nothing to hide. Refuted and
        # unknown findings now survive; only a confirmed finding with nothing
        # in it is dropped.
        context.evidence = [item for item in context.evidence if item.is_reportable]

        counts = Counter(item.state for item in context.evidence)
        context.output["evidence_count"] = len(context.evidence)
        context.output["sources_count"] = len(context.sources)
        context.output["evidence_by_state"] = {
            state.value: counts[state] for state in EvidenceState
        }

        parts = [f"{counts[EvidenceState.CONFIRMED]} confirmed"]
        if counts[EvidenceState.REFUTED]:
            parts.append(f"{counts[EvidenceState.REFUTED]} refuted")
        if counts[EvidenceState.UNKNOWN]:
            parts.append(f"{counts[EvidenceState.UNKNOWN]} unverifiable")

        line = f"{', '.join(parts)} from {len(context.sources)} sources."
        return f"{line}{await self._compare_to_previous(context)}"

    async def _compare_to_previous(self, context: ExecutionContext) -> str:
        """Diff this run against the last one of the same subject.

        Lives here rather than in an agent because it applies to every target,
        and because the evidence list is only final once this stage has
        filtered it — comparing before that would diff against rows the run
        was about to discard.

        Deliberately *not* fed into the risk score. The score is defined as
        "derived from collected on-chain evidence only", and a claim that broke
        since last week already scores through its refuted finding in this run.
        Adding history on top would count the same fact twice and quietly
        change what the number means.
        """
        report = await detect_changes(context)
        if report is None:
            return ""

        context.facts["changes"] = report
        if not report["total"]:
            return " No change since the previous run."

        alarming = report["alarming"]
        note = f" {report['total']} change(s) since the previous run"
        return f"{note}, {alarming} alarming." if alarming else f"{note}."


class SummaryStage(Stage):
    """Generates the AI summary from the collected evidence."""

    stage: ClassVar[PipelineStage] = PipelineStage.REPORT

    async def run(self, context: ExecutionContext) -> str:
        # Everything except this stage is finished, so a watching client can
        # render the complete findings now instead of staring at a spinner for
        # the ten-odd seconds the model takes. This is the whole reason the
        # summary runs last.
        await context.publish(
            "evidence_ready",
            target=context.routing.target.value if context.routing else None,
            address=context.routing.address if context.routing else None,
            facts=context.facts,
            evidence=[item.to_dict() for item in context.evidence],
            sources=[source.to_dict() for source in context.sources],
        )

        if not context.summarize:
            context.summary_status = "skipped"
            context.summary_detail = (
                "This run was a scheduled check, where the comparison against "
                "the previous run is the result. No summary was requested."
            )
            return "Summary skipped for a monitored check."

        outcome = (
            await summarizer.stream(context)
            if context.emitter is not None
            else await summarizer.summarize(context)
        )

        context.summary = outcome.text
        context.summary_status = outcome.status
        context.summary_detail = outcome.detail
        context.summary_model = outcome.model

        if outcome.status == "generated":
            return f"Summary generated by {outcome.model}."

        # A missing summary is reported, never faked — the run still succeeds
        # because the evidence it collected is real and complete.
        return f"Summary unavailable ({outcome.status}): {outcome.detail}"
