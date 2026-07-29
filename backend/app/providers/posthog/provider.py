"""Product analytics, via PostHog.

One rule governs this file: **it never affects the request it is measuring**.
Every method returns None, swallows every error, and does nothing at all when
unconfigured. An analytics outage that failed an execution would be a strictly
worse outcome than having no analytics.

Events are queued and flushed in the background, so a caller never waits on
PostHog. If the process dies with events unflushed, those events are lost —
which is the correct trade for a measurement system.
"""

from __future__ import annotations

import asyncio
import contextlib
from typing import Any, ClassVar

from app.logging import get_logger
from app.models.base import utcnow
from app.providers.base import Provider
from app.providers.types import Capability, ProviderResult

logger = get_logger(__name__)

#: Events held before the oldest are dropped. Bounded so a PostHog outage
#: cannot turn into unbounded memory growth in a long-running process.
MAX_QUEUED_EVENTS = 500

#: How long a batch waits for more events before being sent.
FLUSH_INTERVAL_SECONDS = 5.0
FLUSH_BATCH_SIZE = 25


class AnalyticsEvent:
    """The event names this platform emits. A closed set, so a typo in a call
    site cannot silently create a new event nobody is counting."""

    EXECUTION_STARTED = "execution_started"
    EXECUTION_FINISHED = "execution_finished"
    EXECUTION_FAILED = "execution_failed"
    PROVIDER_USED = "provider_used"
    PROVIDER_FAILED = "provider_failed"
    FEATURE_USED = "feature_used"
    ERROR = "error"


class PostHogProvider(Provider):
    """Fire-and-forget event capture."""

    name: ClassVar[str] = "posthog"
    title: ClassVar[str] = "PostHog"
    description: ClassVar[str] = (
        "Product analytics. Events are queued and flushed in the background, "
        "and every failure is swallowed — measurement never affects a run."
    )
    capabilities: ClassVar[tuple[Capability, ...]] = (Capability.ANALYTICS,)
    required_env: ClassVar[tuple[str, ...]] = ("POSTHOG_API_KEY",)

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._queue: list[dict[str, Any]] = []
        self._flusher: asyncio.Task[None] | None = None
        self._queue_lock = asyncio.Lock()

    def auth_headers(self) -> dict[str, str]:
        # PostHog's capture endpoint authenticates with the project key in the
        # body, not a header. Sending a bearer token would be rejected.
        return {"content-type": "application/json"}

    @property
    def enabled(self) -> bool:
        return self.state.is_usable

    async def _probe(self) -> str:
        # `/decide` is the cheapest endpoint that validates the project key
        # without recording an event — a health check must not appear in the
        # analytics it is checking.
        client = await self.http()
        await client.post_json(
            "/decide?v=3",
            json_body={"api_key": self.key, "distinct_id": "molthood-health"},
            operation="probe",
        )
        return "Capture endpoint responding."

    async def _perform(self, capability: Capability, /, **kwargs: Any) -> ProviderResult:
        await self.capture(**kwargs)
        return ProviderResult.success(self.name, capability, data={"queued": True})

    # --- the surface everything else calls ---------------------------------

    async def capture(
        self,
        event: str,
        *,
        distinct_id: str = "anonymous",
        properties: dict[str, Any] | None = None,
        **_: Any,
    ) -> None:
        """Record one event. Returns nothing and raises nothing, ever."""
        if not self.enabled:
            return

        try:
            payload = {
                "event": event,
                "distinct_id": distinct_id,
                "properties": {
                    **(properties or {}),
                    # Marks server-side events so they are not confused with
                    # anything a browser sends.
                    "$lib": "molthood-backend",
                },
                "timestamp": utcnow().isoformat(),
            }

            async with self._queue_lock:
                if len(self._queue) >= MAX_QUEUED_EVENTS:
                    # Drop the oldest. A backlog means PostHog is unreachable,
                    # and recent events are more useful than stale ones.
                    self._queue.pop(0)
                self._queue.append(payload)

            self._ensure_flusher()
        except Exception as exc:
            logger.debug("analytics_capture_failed", error=str(exc))

    async def execution_started(
        self, execution_id: str, target: str, distinct_id: str = "anonymous"
    ) -> None:
        await self.capture(
            AnalyticsEvent.EXECUTION_STARTED,
            distinct_id=distinct_id,
            properties={"execution_id": execution_id, "target": target},
        )

    async def execution_finished(
        self,
        execution_id: str,
        *,
        target: str,
        duration_ms: int | None,
        evidence_count: int,
        providers: list[str],
        distinct_id: str = "anonymous",
    ) -> None:
        await self.capture(
            AnalyticsEvent.EXECUTION_FINISHED,
            distinct_id=distinct_id,
            properties={
                "execution_id": execution_id,
                "target": target,
                "duration_ms": duration_ms,
                "evidence_count": evidence_count,
                "providers": providers,
            },
        )

    async def execution_failed(
        self,
        execution_id: str,
        *,
        target: str,
        error: str,
        distinct_id: str = "anonymous",
    ) -> None:
        await self.capture(
            AnalyticsEvent.EXECUTION_FAILED,
            distinct_id=distinct_id,
            properties={
                "execution_id": execution_id,
                "target": target,
                # Truncated: an error string can carry a whole payload, and
                # analytics is not the place for one.
                "error": error[:300],
            },
        )

    async def provider_used(
        self,
        provider: str,
        capability: str,
        *,
        ok: bool,
        duration_ms: int | None,
        distinct_id: str = "anonymous",
    ) -> None:
        await self.capture(
            AnalyticsEvent.PROVIDER_USED if ok else AnalyticsEvent.PROVIDER_FAILED,
            distinct_id=distinct_id,
            properties={
                "provider": provider,
                "capability": capability,
                "duration_ms": duration_ms,
            },
        )

    async def feature_used(
        self, feature: str, distinct_id: str = "anonymous", **properties: Any
    ) -> None:
        await self.capture(
            AnalyticsEvent.FEATURE_USED,
            distinct_id=distinct_id,
            properties={"feature": feature, **properties},
        )

    # --- delivery ----------------------------------------------------------

    def _ensure_flusher(self) -> None:
        if self._flusher is None or self._flusher.done():
            with contextlib.suppress(RuntimeError):
                # No running loop means there is nothing to schedule onto —
                # a synchronous caller, or shutdown. The event stays queued.
                self._flusher = asyncio.create_task(self._flush_loop())

    async def _flush_loop(self) -> None:
        while True:
            await asyncio.sleep(FLUSH_INTERVAL_SECONDS)

            async with self._queue_lock:
                batch = self._queue[:FLUSH_BATCH_SIZE]
                self._queue = self._queue[FLUSH_BATCH_SIZE:]
                remaining = len(self._queue)

            if batch:
                await self._send(batch)

            if not remaining:
                # Nothing left. Stop rather than tick forever on an idle
                # deployment; the next capture restarts the loop.
                return

    async def _send(self, batch: list[dict[str, Any]]) -> None:
        try:
            client = await self.http()
            await client.post_json(
                "/batch/",
                json_body={"api_key": self.key, "batch": batch},
                operation="capture",
            )
        except Exception as exc:
            # Deliberately terminal. Re-queuing on failure would let an outage
            # build a backlog that never drains and competes with real work.
            logger.debug("analytics_flush_failed", events=len(batch), error=str(exc))

    async def flush(self) -> None:
        """Send whatever is queued now. Called on shutdown."""
        if not self.enabled:
            return

        async with self._queue_lock:
            batch = self._queue
            self._queue = []

        if batch:
            await self._send(batch)

    async def aclose(self) -> None:
        if self._flusher is not None and not self._flusher.done():
            self._flusher.cancel()
            await asyncio.gather(self._flusher, return_exceptions=True)
        await self.flush()
        await super().aclose()
