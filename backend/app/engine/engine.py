"""The execution engine.

Drives one request through the pipeline:

    Request → Router → Service Layer → Evidence → AI Summary → Result

The engine owns run-level concerns: status transitions, timing, concurrency
limits, failure semantics, and the execution log line. Stages own the work;
agents own the domain; services own the network.
"""

from __future__ import annotations

import asyncio

from app.config import Settings, get_settings
from app.core.exceptions import MolthoodError
from app.engine.context import EventEmitter, ExecutionContext, ExecutionRequest
from app.engine.result import ExecutionResult, StageResult
from app.logging import get_logger
from app.models.base import utcnow
from app.models.enums import ExecutionStatus
from app.pipelines.registry import PipelineRegistry, pipeline_registry
from app.services.registry import ServiceRegistry, get_service_registry

logger = get_logger(__name__)


class ExecutionEngine:
    """Runs executions against a registered pipeline.

    Stateless between runs. Nothing is persisted — persistence is a later
    phase, so the caller keeps whatever it needs from the returned result.
    """

    def __init__(
        self,
        *,
        pipelines: PipelineRegistry | None = None,
        services: ServiceRegistry | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._pipelines = pipelines or pipeline_registry
        self._services = services or get_service_registry()
        self._settings = settings or get_settings()
        self._semaphore = asyncio.Semaphore(self._settings.max_concurrent_executions)

    async def submit(
        self,
        request: ExecutionRequest,
        *,
        emitter: EventEmitter | None = None,
        owner_key_id: str | None = None,
        summarize: bool = True,
    ) -> ExecutionResult:
        """Run a request end to end, honouring the concurrency limit.

        Raises `NotFoundError` if the named pipeline is not registered — a
        caller error, kept distinguishable from a failed run.

        `emitter` receives progress events for a client watching live. It
        changes nothing about what the run does or stores.
        """
        async with self._semaphore:
            context = ExecutionContext(
                request=request,
                services=self._services,
                emitter=emitter,
                owner_key_id=owner_key_id,
                summarize=summarize,
            )
            return await self._run(context)

    async def _run(self, context: ExecutionContext) -> ExecutionResult:
        pipeline = self._pipelines.get(context.request.pipeline)
        log = logger.bind(execution_id=context.execution_id, pipeline=pipeline.name)

        context.status = ExecutionStatus.RUNNING
        context.started_at = utcnow()
        stage_results: list[StageResult] = []

        log.info("execution_started", request=context.request.request[:200])

        try:
            async with asyncio.timeout(self._settings.execution_timeout_seconds):
                for stage in pipeline.stages:
                    stage_result = await stage.execute(context)
                    stage_results.append(stage_result)

                    if not stage_result.success:
                        # A failed stage stops the run; later stages would be
                        # operating on incomplete state.
                        context.status = ExecutionStatus.FAILED
                        context.error = stage_result.error
                        break
                else:
                    context.status = ExecutionStatus.SUCCEEDED
        except TimeoutError:
            context.status = ExecutionStatus.FAILED
            context.error = (
                f"Execution exceeded {self._settings.execution_timeout_seconds}s."
            )
            log.warning("execution_timeout")
        except MolthoodError as exc:
            context.status = ExecutionStatus.FAILED
            context.error = exc.message
            log.warning("execution_error", code=exc.code, detail=exc.message)
        except Exception as exc:
            context.status = ExecutionStatus.FAILED
            context.error = str(exc)
            log.exception("execution_unexpected_error", error=str(exc))

        context.finished_at = utcnow()
        result = self._build_result(context, stage_results)

        # Imported here rather than at module scope: the store imports engine
        # result types, and a top-level import would close that loop.
        from app.repositories import get_execution_store

        await get_execution_store().record(context.request.request, result)

        # The execution log line required by the platform: id, agents,
        # services, duration, outcome.
        log.info(
            "execution_finished",
            status=result.status.value,
            target=result.target,
            address=result.address,
            agents_used=result.agents_used,
            services_called=result.services_called,
            evidence_count=len(result.evidence),
            summary_status=result.summary_status,
            duration_ms=result.execution_time_ms,
            success=result.succeeded,
        )
        return result

    def _build_result(
        self, context: ExecutionContext, stages: list[StageResult]
    ) -> ExecutionResult:
        agents_used = [
            task.agent_kind.value
            for task in context.tasks
            if task.agent_kind is not None and task.status.value == "completed"
        ]

        return ExecutionResult(
            execution_id=context.execution_id,
            status=context.status,
            stage=context.stage,
            target=context.routing.target.value if context.routing else None,
            address=context.routing.address if context.routing else None,
            owner_key_id=context.owner_key_id,
            agents_used=agents_used,
            services_called=list(context.services_called),
            summary=context.summary,
            summary_status=context.summary_status,
            summary_detail=context.summary_detail,
            summary_model=context.summary_model,
            facts=context.facts,
            evidence=[item.to_dict() for item in context.evidence],
            sources=[source.to_dict() for source in context.sources],
            tasks=[task.to_dict() for task in context.tasks],
            stages=stages,
            execution_time_ms=context.duration_ms,
            error=context.error,
        )

    async def analyze(
        self,
        *,
        target: str,
        address: str | None = None,
        request_text: str | None = None,
        use_cache: bool = True,
        emitter: EventEmitter | None = None,
        owner_key_id: str | None = None,
        summarize: bool = True,
    ) -> ExecutionResult:
        """Convenience entry point for the typed `GET` analysis routes.

        Sets the target explicitly so the router does not have to infer it.

        A recent successful analysis of the same subject is returned instead of
        re-running: the work takes fifteen-odd seconds and spends real credit
        on a summary that would say the same thing about a chain that has
        barely moved. Pass `use_cache=False` to force a fresh run.
        """
        if use_cache:
            # Scoped to the caller. A shared cache would be cheaper, but it
            # would also let anyone learn that someone else had just analysed a
            # given address — and on a wallet target that is a real disclosure.
            cached = await self._cached(target, address, owner_key_id)
            if cached is not None:
                logger.info(
                    "execution_served_from_cache",
                    execution_id=cached.execution_id,
                    target=target,
                    address=address,
                )
                return cached

        default_text = (
            f"Analyze {target} {address}" if address else f"Analyze the {target}"
        )
        metadata: dict[str, object] = {"target": target}
        if address:
            metadata["address"] = address

        return await self.submit(
            ExecutionRequest(
                request=request_text or default_text,
                metadata=metadata,
            ),
            emitter=emitter,
            owner_key_id=owner_key_id,
            summarize=summarize,
        )

    async def _cached(
        self, target: str, address: str | None, owner_key_id: str | None
    ) -> ExecutionResult | None:
        """Look for a fresh, successful run of the same subject.

        Read off the event loop for the same reason writes are: the session is
        synchronous, and a lock contended by another write would stall every
        other request.
        """
        from app.repositories import cache_window_seconds, get_execution_store

        window = cache_window_seconds()
        if window <= 0:
            return None

        try:
            return await asyncio.to_thread(
                get_execution_store().find_recent,
                target,
                address,
                window,
                owner_key_id,
            )
        except Exception as exc:
            # A cache that cannot be read is not a reason to refuse the work.
            logger.warning("execution_cache_unavailable", error=str(exc))
            return None


#: Process-wide engine instance.
execution_engine = ExecutionEngine()
