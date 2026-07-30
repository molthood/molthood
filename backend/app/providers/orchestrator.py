"""Running one task end to end.

This is the piece that makes the provider layer a platform rather than a set
of clients: a request goes in, the router decides what kind of task it is, the
manager decides who can serve each step, the steps run — in parallel where
nothing depends on anything — and a `Report` comes out.

Four properties are load-bearing:

* **A skipped step is in the report.** Not omitted. A reader who cannot see
  that the crawl never ran has no way to tell thorough coverage from a missing
  key, and the whole platform is built on that distinction being visible.
* **A failed step does not fail the task.** Providers return results, not
  exceptions, so losing one leaves the rest intact. Only a *required* step
  with no provider stops the run, and then the report says which variable
  would fix it.
* **Confidence is derived, never assumed.** It comes from how much of the plan
  actually ran. A task where nothing established anything reports `unknown`
  rather than a number that reads as reassurance.
* **Identical work is done once.** Cache first, then an in-flight map so two
  concurrent identical requests share one execution rather than paying twice.
"""

from __future__ import annotations

import asyncio
import hashlib
import time
from typing import Any

from app.engine.labels import describe_service
from app.logging import get_logger
from app.models.base import new_id, utcnow
from app.providers.content import classify_urls
from app.providers.inputs import TaskInput, extract
from app.providers.manager import ProviderManager, get_provider_manager
from app.providers.types import Capability, ProviderResult
from app.providers.workflows import (
    WORKFLOWS,
    Plan,
    PlannedStep,
    TaskKind,
    classify,
    plan,
)
from app.schemas.report import (
    ArtifactRef,
    Citation,
    EvidenceItem,
    ExecutionStep,
    Performance,
    ProviderTiming,
    Report,
)

logger = get_logger(__name__)

#: How long a finished report is served instead of being recomputed. A research
#: task costs several provider calls and real credit; the web does not move
#: enough in ten minutes to justify paying twice.
REPORT_TTL_SECONDS = 600

#: How long a report stays retrievable by id. Longer than the reuse window,
#: because a link to a result should outlive the point at which we would
#: recompute it.
REPORT_RETENTION_SECONDS = 86_400

CACHE_NAMESPACE = "tasks"

#: Sources read in the dependent phase of a research task. Bounded because each
#: one is a billed fetch and the tail of a result list is rarely worth it.
MAX_FOLLOW_READS = 3


def fingerprint(kind: TaskKind, request: str) -> str:
    """A stable id for identical work.

    Normalised so trivial differences — casing, spacing — do not defeat the
    cache. Hashed rather than stored raw because a request can be long and this
    becomes a cache key.
    """
    normalised = " ".join(request.lower().split())
    digest = hashlib.sha256(f"{kind.value}:{normalised}".encode()).hexdigest()
    return digest[:32]


class TaskOrchestrator:
    """Runs a request through its workflow and assembles the report."""

    def __init__(self, manager: ProviderManager | None = None) -> None:
        self._manager = manager or get_provider_manager()
        #: Identical requests already running, keyed by fingerprint. This is
        #: what stops two concurrent callers both paying for the same research.
        self._in_flight: dict[str, asyncio.Task[Report]] = {}

    # --- entry point -------------------------------------------------------

    async def run(
        self, request: str, *, use_cache: bool = True, owner: str = "anonymous"
    ) -> Report:
        kind = classify(request)
        key = fingerprint(kind, request)

        if use_cache:
            cached = await self._cached(key)
            if cached is not None:
                logger.info(
                    "task_served_from_cache",
                    kind=kind.value,
                    task_id=cached.task_id,
                )
                cached.performance.cache_hit = True
                return cached

            # Someone identical is already running. Awaiting their task is both
            # cheaper and more consistent than starting a second one that would
            # produce a near-identical report a moment later.
            running = self._in_flight.get(key)
            if running is not None and not running.done():
                logger.info("task_joined_in_flight", kind=kind.value)
                return await asyncio.shield(running)

        task = asyncio.create_task(self._execute(request, kind, key, owner))
        self._in_flight[key] = task

        try:
            return await task
        finally:
            # Cleared unconditionally: a task left in the map after failing
            # would make every later caller await a dead future.
            self._in_flight.pop(key, None)

    # --- execution ---------------------------------------------------------

    async def _execute(
        self, request: str, kind: TaskKind, key: str, owner: str
    ) -> Report:
        started = time.perf_counter()
        task_id = new_id()
        resolved = plan(kind, self._manager)
        task_input = extract(request)

        report = Report(
            task_id=task_id,
            kind=kind.value,
            request=request,
            created_at=utcnow(),
            reasoning=[
                f"Classified as {kind.value}: {WORKFLOWS[kind].description}",
                f"Resolved {len(resolved.steps)} step(s) against "
                f"{self._manager.snapshot()['usable']} usable provider(s).",
            ],
            blocked_by=resolved.blocked_by,
        )

        await self._track_started(task_id, kind, owner)

        if not resolved.runnable:
            return self._blocked(report, resolved, started)

        results = await self._run_plan(resolved, task_input, report)

        self._assemble(report, resolved, results, task_input)
        report.performance.total_ms = int((time.perf_counter() - started) * 1000)
        report.performance.cache_backend = self._manager.redis.backend

        await self._store(key, report)
        await self._track_finished(report, owner)

        return report

    async def _run_plan(
        self, resolved: Plan, task_input: TaskInput, report: Report
    ) -> dict[str, ProviderResult]:
        """Run the independent steps together, then the dependent ones."""
        independent = [step for step in resolved.active_steps if not step.needs_results]
        dependent = [step for step in resolved.active_steps if step.needs_results]

        results: dict[str, ProviderResult] = {}

        # Nothing here depends on anything else, so waiting for them in
        # sequence would make a research task as slow as the sum of its parts.
        gathered = await asyncio.gather(
            *(self._run_step(step, task_input) for step in independent),
            return_exceptions=False,
        )
        for step, result in zip(independent, gathered, strict=True):
            if result is not None:
                results[step.capability.value] = result

        for step in dependent:
            follow = await self._run_dependent(step, results, report)
            if follow:
                results[step.capability.value] = follow

        return results

    async def _run_step(
        self, step: PlannedStep, task_input: TaskInput
    ) -> ProviderResult | None:
        arguments = task_input.arguments_for(step.capability)

        if arguments is None:
            # The request simply does not carry what this step needs. Recorded
            # on the step rather than guessed at.
            step.skipped_because = (
                f"The request contains no {_input_name(step.capability)} to use."
            )
            return None

        provider = self._manager.get(step.provider or "")
        if provider is None:
            return None

        return await provider.execute(step.capability, **arguments)

    async def _run_dependent(
        self,
        step: PlannedStep,
        results: dict[str, ProviderResult],
        report: Report,
    ) -> ProviderResult | None:
        """Read the strongest sources the earlier steps found."""
        urls = _top_urls(results, limit=MAX_FOLLOW_READS)

        if not urls:
            step.skipped_because = "No earlier step produced a source to read."
            return None

        provider = self._manager.get(step.provider or "")
        if provider is None:
            return None

        # A batch capability takes the whole list in one call. Looping over it
        # with a singular `url` was both wrong and self-defeating: it raised on
        # the missing argument, and had it not, it would have paid per URL for
        # the one operation that exists to charge once.
        if step.capability is Capability.READ_MANY:
            batch = await provider.execute(step.capability, urls=urls)
            report.reasoning.append(
                f"Read {len(urls)} page(s) identified as significant, in one request."
            )
            return batch

        reads = await asyncio.gather(
            *(provider.execute(step.capability, url=url) for url in urls)
        )
        succeeded = [item for item in reads if item.ok]

        report.reasoning.append(
            f"Read {len(succeeded)} of {len(urls)} top source(s) in full."
        )

        if not succeeded:
            return reads[0] if reads else None

        # Folded into one result so the report has a single "sources read"
        # entry rather than one per URL.
        merged = ProviderResult.success(
            succeeded[0].provider,
            step.capability,
            data={"pages": [item.data for item in succeeded]},
            citations=[citation for item in succeeded for citation in item.citations],
        )
        # The wall time of the batch, not the sum. These ran together, so
        # summing would report a step as taking longer than the whole task —
        # which it did, in the first live run: 60s of "read_url" inside a 56s
        # task. A timing that cannot be true is worse than no timing.
        merged.duration_ms = max((item.duration_ms or 0) for item in reads)
        return merged

    # --- report assembly ---------------------------------------------------

    def _assemble(
        self,
        report: Report,
        resolved: Plan,
        results: dict[str, ProviderResult],
        task_input: TaskInput,
    ) -> None:
        seen: set[str] = set()
        provider_ms = 0

        for step in resolved.steps:
            result = results.get(step.capability.value)

            report.timeline.append(
                ExecutionStep(
                    capability=step.capability.value,
                    provider=step.provider,
                    required=step.required,
                    description=step.description,
                    ok=result.ok if result else None,
                    duration_ms=result.duration_ms if result else None,
                    error=result.error if result and not result.ok else None,
                    skipped_because=step.skipped_because,
                )
            )

            if result is None:
                continue

            provider_ms += result.duration_ms or 0
            report.providers.append(
                ProviderTiming(
                    provider=result.provider,
                    capability=result.capability.value,
                    ok=result.ok,
                    duration_ms=result.duration_ms,
                    citations=len(result.citations),
                )
            )
            report.warnings.extend(result.warnings)

            if not result.ok:
                continue

            for raw in result.citations:
                url = raw.get("url")
                if not url or url in seen:
                    continue
                seen.add(str(url))
                report.sources.append(
                    Citation(
                        url=str(url),
                        title=raw.get("title"),
                        published_at=raw.get("published_at"),
                        provider=str(raw.get("provider") or result.provider),
                    )
                )

            report.evidence.extend(_evidence_from(result))
            report.artifacts.extend(_artifacts_from(result))

        ran = [step for step in report.timeline if step.ok is True]
        skipped = [
            step
            for step in report.timeline
            if step.provider is None or step.skipped_because
        ]

        report.performance = Performance(
            provider_ms=provider_ms,
            steps_run=len(ran),
            steps_skipped=len(skipped),
            cache_backend=self._manager.redis.backend,
        )

        report.confidence, report.confidence_reason = _confidence(report, resolved)

        if task_input.url:
            report.reasoning.append(f"Subject URL: {task_input.url}")

    def _blocked(self, report: Report, resolved: Plan, started: float) -> Report:
        """A plan whose required step nothing can serve.

        Returned as a report rather than an error, because everything else in
        it — what was attempted, what is missing, what would fix it — is
        genuinely useful and an exception would throw it away.
        """
        report.timeline = [
            ExecutionStep(
                capability=step.capability.value,
                provider=step.provider,
                required=step.required,
                description=step.description,
                skipped_because=step.skipped_because,
            )
            for step in resolved.steps
        ]
        report.confidence = "unknown"
        report.confidence_reason = (
            "A required step has no provider on this deployment, so nothing ran."
        )
        report.error = (
            "This task needs a capability no configured provider offers. Set "
            + ", ".join(resolved.blocked_by)
            + " to enable it."
            if resolved.blocked_by
            else "This task needs a capability no provider offers."
        )
        report.performance.total_ms = int((time.perf_counter() - started) * 1000)
        report.summary_status = "skipped"
        report.summary_detail = "Nothing ran, so there was nothing to summarise."
        return report

    # --- caching -----------------------------------------------------------

    async def _cached(self, key: str) -> Report | None:
        raw = await self._manager.redis.get(key, namespace=CACHE_NAMESPACE)
        if not isinstance(raw, dict):
            return None
        try:
            return Report.model_validate(raw)
        except Exception:
            # A stored report from an older shape. Recomputing is correct.
            return None

    async def _store(self, key: str, report: Report) -> None:
        payload = report.model_dump(mode="json")
        await self._manager.redis.set(
            key, payload, ttl_seconds=REPORT_TTL_SECONDS, namespace=CACHE_NAMESPACE
        )
        # Also stored by id, and for longer: a shared link should outlive the
        # window in which we would recompute the same request.
        await self._manager.redis.set(
            report.task_id,
            payload,
            ttl_seconds=REPORT_RETENTION_SECONDS,
            namespace=CACHE_NAMESPACE,
        )

    async def get(self, task_id: str) -> Report | None:
        return await self._cached(task_id)

    # --- analytics ---------------------------------------------------------

    async def _track_started(self, task_id: str, kind: TaskKind, owner: str) -> None:
        await self._manager.posthog.execution_started(task_id, kind.value, owner)

    async def _track_finished(self, report: Report, owner: str) -> None:
        posthog = self._manager.posthog
        await posthog.execution_finished(
            report.task_id,
            target=report.kind,
            duration_ms=report.performance.total_ms,
            evidence_count=len(report.evidence),
            providers=[item.provider for item in report.providers],
            distinct_id=owner,
        )
        for timing in report.providers:
            await posthog.provider_used(
                timing.provider,
                timing.capability,
                ok=timing.ok,
                duration_ms=timing.duration_ms,
                distinct_id=owner,
            )


# --- helpers ---------------------------------------------------------------


def _input_name(capability: Capability) -> str:
    if capability in (
        Capability.READ_URL,
        Capability.CRAWL_SITE,
        Capability.SCREENSHOT,
        Capability.SIMILAR_PAGES,
    ):
        return "URL"
    if capability is Capability.RUN_CODE:
        return "fenced code block"
    return "query"


#: Which parts of a site actually answer questions about it, best first.
#: A pricing page says more about a project than its twentieth blog post.
_SECTION_PRIORITY = ("documentation", "pricing", "about", "legal", "blog")


def _significant_pages(results: dict[str, ProviderResult], *, limit: int) -> list[str]:
    """Pages worth rendering, chosen from a site map.

    The map returns every URL a site exposes — often thousands — and reading
    them all would cost more than the audit is worth. Classifying by section
    and taking the best few turns an unusable list into a decision: the
    documentation, the pricing, the terms.
    """
    mapped = results.get(Capability.MAP_SITE.value)
    if mapped is None or not mapped.ok or not isinstance(mapped.data, dict):
        return []

    entries = mapped.data.get("urls")
    if not isinstance(entries, list):
        return []

    every = [
        entry["url"]
        for entry in entries
        if isinstance(entry, dict) and isinstance(entry.get("url"), str)
    ]
    sections = classify_urls(every)

    chosen: list[str] = []
    for name in _SECTION_PRIORITY:
        for url in sections.get(name, [])[:2]:
            if url not in chosen:
                chosen.append(url)
            if len(chosen) >= limit:
                return chosen
    return chosen


def _top_urls(results: dict[str, ProviderResult], *, limit: int) -> list[str]:
    """The best sources the earlier steps found, in preference order.

    A **site map is consulted first** when one exists. Its URLs are the site's
    own, chosen by what each section is for, so reading them answers questions
    about the site itself — whereas search results are what the rest of the
    web says about it. For an audit those are different questions, and the
    first is the one that was asked.

    Failing that, semantic results lead: they are ranked by meaning rather than
    keyword, so the top of that list is likeliest to be worth a full read.
    """
    urls: list[str] = list(_significant_pages(results, limit=limit))
    if len(urls) >= limit:
        return urls[:limit]

    order = (
        Capability.SEMANTIC_SEARCH.value,
        Capability.WEB_SEARCH.value,
        Capability.NEWS_SEARCH.value,
    )

    for name in order:
        result = results.get(name)
        if result is None or not result.ok:
            continue
        for citation in result.citations:
            url = citation.get("url")
            if isinstance(url, str) and url not in urls:
                urls.append(url)
            if len(urls) >= limit:
                return urls
    return urls


def _evidence_from(result: ProviderResult) -> list[EvidenceItem]:
    """Facts the step genuinely established.

    Deliberately sparse. A search returning ten links establishes that ten
    links exist, not that anything in them is true, so the evidence recorded
    here is about the retrieval — the links themselves are `sources`.
    """
    data = result.data if isinstance(result.data, dict) else {}
    capability = result.capability
    items: list[EvidenceItem] = []

    if capability in (
        Capability.WEB_SEARCH,
        Capability.SEMANTIC_SEARCH,
        Capability.NEWS_SEARCH,
    ):
        found = len(data.get("results") or [])
        items.append(
            EvidenceItem(
                # Named by capability as well as provider: one provider can
                # serve several, and two rows reading "Sources found by exa: 8"
                # look like a duplicate rather than two different searches.
                kind=f"sources_found:{capability.value}",
                label=(
                    f"Sources found by {describe_service(result.provider)} "
                    f"({capability.value.replace('_', ' ')})"
                ),
                value=found,
                state="confirmed" if found else "unknown",
                reason=None if found else "The search returned no results.",
            )
        )
        if data.get("answer"):
            items.append(
                EvidenceItem(
                    kind="provider_answer",
                    label=f"{result.provider} synthesised answer",
                    value=data["answer"],
                )
            )

    elif capability is Capability.READ_URL:
        pages = data.get("pages")
        if isinstance(pages, list):
            items.append(
                EvidenceItem(
                    kind="pages_read",
                    label="Sources read in full",
                    value=len(pages),
                )
            )
        else:
            text = data.get("text") or ""
            items.append(
                EvidenceItem(
                    kind="page_read",
                    label="Page reachable and readable",
                    value=f"{len(text)} characters",
                    state="confirmed" if text else "refuted",
                    reason=None if text else "The page returned no readable text.",
                )
            )
            if data.get("title"):
                items.append(
                    EvidenceItem(
                        kind="page_title", label="Page title", value=data["title"]
                    )
                )
            if data.get("status_code"):
                items.append(
                    EvidenceItem(
                        kind="http_status",
                        label="HTTP status",
                        value=data["status_code"],
                    )
                )

    elif capability is Capability.CRAWL_SITE:
        items.append(
            EvidenceItem(
                kind="crawl",
                label="Site crawl",
                value=data.get("state"),
                state="unknown" if data.get("state") == "accepted" else "confirmed",
                reason=(
                    "The crawl was accepted and runs asynchronously; its pages "
                    "are not in this report."
                    if data.get("state") == "accepted"
                    else None
                ),
            )
        )

    elif capability is Capability.SCREENSHOT:
        items.append(
            EvidenceItem(
                kind="screenshot",
                label="Rendered screenshot captured",
                value=bool(data.get("screenshot")),
                state="confirmed" if data.get("screenshot") else "refuted",
                reason=None if data.get("screenshot") else "No image was returned.",
            )
        )

    elif capability is Capability.RUN_CODE:
        error = data.get("error")
        items.append(
            EvidenceItem(
                kind="code_execution",
                label="Code ran without raising",
                value=not error,
                state="confirmed" if not error else "refuted",
                reason=error,
            )
        )
        if data.get("stdout"):
            items.append(
                EvidenceItem(
                    kind="stdout", label="Program output", value=data["stdout"][:2000]
                )
            )

    return items


def _artifacts_from(result: ProviderResult) -> list[ArtifactRef]:
    data = result.data if isinstance(result.data, dict) else {}
    raw = data.get("artifacts")
    if not isinstance(raw, list):
        return []

    artifacts: list[ArtifactRef] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            artifacts.append(
                ArtifactRef(
                    name=str(item["name"]),
                    kind=item.get("kind", "file"),
                    size_bytes=int(item.get("size_bytes") or 0),
                    encoding=item.get("encoding", "utf-8"),
                    content=str(item.get("content") or ""),
                    produced_by=result.provider,
                )
            )
        except Exception:
            continue
    return artifacts


def _confidence(report: Report, resolved: Plan) -> tuple[Any, str]:
    """How much of the plan actually ran.

    Never a default that reads as reassurance: a task where nothing was
    established reports `unknown`, not `low`, because low implies something was
    weighed and found weak.
    """
    total = len(resolved.steps)
    ran = sum(1 for step in report.timeline if step.ok is True)
    failed = sum(1 for step in report.timeline if step.ok is False)

    if ran == 0:
        return "unknown", "No step produced a result, so nothing was established."

    if ran == total:
        return "high", f"All {total} planned step(s) ran successfully."

    if failed:
        return (
            "low",
            f"{ran} of {total} step(s) ran; {failed} failed. The report covers "
            "less than the plan intended.",
        )

    return (
        "medium",
        f"{ran} of {total} step(s) ran. The rest were skipped — see the "
        "timeline for why.",
    )


_orchestrator: TaskOrchestrator | None = None


def get_orchestrator() -> TaskOrchestrator:
    """Process-wide instance, so the in-flight map is shared by every caller."""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = TaskOrchestrator()
    return _orchestrator
