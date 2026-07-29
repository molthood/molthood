"""Deferred work, via Upstash QStash.

QStash delivers by calling an HTTP endpoint back, which means two things this
module has to be honest about. It needs a **publicly reachable** callback URL,
so a laptop cannot receive deliveries however valid its token is. And every
message is a request the platform will later receive from the internet, so the
receiving route has to verify the signature — publishing is only half of it.

With no credentials the publisher reports unavailable and returns a refusal
rather than dropping work silently. A queue that accepts and discards is worse
than one that declines.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, ClassVar

from app.logging import get_logger
from app.providers.base import Provider
from app.providers.types import Capability, ProviderHealth, ProviderResult

logger = get_logger(__name__)

#: QStash's own ceiling on delivery attempts.
MAX_RETRIES = 5
DEFAULT_RETRIES = 3


class QStashProvider(Provider):
    """Background, delayed, and scheduled delivery."""

    name: ClassVar[str] = "upstash_qstash"
    title: ClassVar[str] = "Upstash QStash"
    description: ClassVar[str] = (
        "Runs work later by calling an endpoint back — in the background, "
        "after a delay, or on a schedule. Needs a publicly reachable callback "
        "URL, so it cannot deliver to a local machine."
    )
    capabilities: ClassVar[tuple[Capability, ...]] = (Capability.QUEUE,)
    #: Both, and the second is not optional. A token alone cannot deliver
    #: anything — see `has_credentials`.
    required_env: ClassVar[tuple[str, ...]] = (
        "QSTASH_TOKEN",
        "QSTASH_CALLBACK_BASE_URL",
    )

    def __init__(self, *, callback_base_url: str = "", **kwargs: Any) -> None:
        super().__init__(**kwargs)
        #: Where QStash calls back. Without it nothing can be published, which
        #: is reported rather than discovered at delivery time.
        self._callback_base = callback_base_url.rstrip("/")
        #: Set once the token has been confirmed against the real API, so the
        #: status can distinguish "not deployable yet" from "credential wrong".
        self._token_verified = False

    @property
    def can_receive_callbacks(self) -> bool:
        return bool(self._callback_base)

    @property
    def has_credentials(self) -> bool:
        """A token without a callback URL is not a working configuration.

        QStash does not hold work for a worker to collect — it *calls an HTTP
        endpoint back*. With no publicly reachable URL there is nowhere for a
        delivery to land, so every publish fails.

        This has to be expressed as a missing credential rather than as a
        detail string, because the router reads `state` and would otherwise
        route queue work to a provider that refuses all of it. Reporting
        `enabled` for something that cannot serve a single request is the same
        failure as a cache reporting `healthy` while dropping every write.
        """
        return self._api_key is not None and self.can_receive_callbacks

    @property
    def missing_env(self) -> tuple[str, ...]:
        absent: list[str] = []
        if self._api_key is None:
            absent.append("QSTASH_TOKEN")
        if not self.can_receive_callbacks:
            absent.append("QSTASH_CALLBACK_BASE_URL")
        return tuple(absent)

    def _unavailable_detail(self) -> str:
        if self._api_key is not None and not self.can_receive_callbacks:
            verified = (
                " The token itself has been verified." if self._token_verified else ""
            )
            return (
                "QSTASH_CALLBACK_BASE_URL is not set. QStash delivers by "
                "calling a public URL back, so nothing can be published until "
                "this deployment has one — a local machine cannot receive "
                f"deliveries however valid the token is.{verified}"
            )
        return super()._unavailable_detail()

    async def verify_token(self) -> tuple[bool, str]:
        """Whether the token itself works, regardless of delivery.

        Separate from `health()` because the two questions have different
        answers and both matter. Listing schedules is a read that needs no
        callback URL, so a token can be confirmed good long before anything is
        deployed — and an operator setting this up deserves to know the
        credential is right rather than waiting until deploy day to find out.

        `state` stays `missing_key` while delivery is impossible, because that
        is what governs routing. This only enriches what the status *says*.
        """
        if self._api_key is None:
            return False, "No token configured."

        try:
            client = await self.http()
            await client.get_json("/v2/schedules", operation="verify")
        except Exception as exc:
            self._token_verified = False
            return False, f"QStash rejected the token ({type(exc).__name__})."

        self._token_verified = True
        return True, "Token verified."

    async def _probe(self) -> str:
        client = await self.http()
        await client.get_json("/v2/schedules", operation="probe")
        return "Publishing available."

    async def initialize(self) -> ProviderHealth:
        """Probe as usual, and additionally confirm the token when delivery is
        not configured — so a deployment being prepared knows the credential is
        right before it has a public URL."""
        if self._api_key is not None and not self.can_receive_callbacks:
            await self.verify_token()
        return await super().initialize()

    async def _perform(self, capability: Capability, /, **kwargs: Any) -> ProviderResult:
        return await self.publish(**kwargs)

    # --- publishing --------------------------------------------------------

    async def publish(
        self,
        *,
        path: str,
        body: dict[str, Any] | None = None,
        delay_seconds: int | None = None,
        not_before: datetime | None = None,
        cron: str | None = None,
        retries: int = DEFAULT_RETRIES,
        deduplication_id: str | None = None,
        **_: Any,
    ) -> ProviderResult:
        """Hand one job to QStash for later delivery.

        `path` is relative to the callback base, so callers never build an
        absolute URL and cannot accidentally point deliveries somewhere else.
        """
        if not self.can_receive_callbacks:
            return ProviderResult.failure(
                self.name,
                Capability.QUEUE,
                self._unavailable_detail(),
                error_code="callback_url_missing",
            )

        destination = f"{self._callback_base}/{path.lstrip('/')}"

        headers: dict[str, str] = {
            "content-type": "application/json",
            "upstash-retries": str(min(max(0, retries), MAX_RETRIES)),
        }
        if delay_seconds and delay_seconds > 0:
            headers["upstash-delay"] = f"{int(delay_seconds)}s"
        if not_before is not None:
            headers["upstash-not-before"] = str(int(not_before.timestamp()))
        if cron:
            headers["upstash-cron"] = cron
        if deduplication_id:
            # Makes publishing idempotent — a retried publish produces one
            # delivery, not two.
            headers["upstash-deduplication-id"] = deduplication_id

        client = await self.http()
        payload = await client.request(
            "POST",
            f"/v2/publish/{destination}",
            json_body=body or {},
            headers=headers,
            operation="publish",
        )

        message_id = payload.get("messageId") if isinstance(payload, dict) else None
        schedule_id = payload.get("scheduleId") if isinstance(payload, dict) else None

        logger.info(
            "queue_published",
            destination=path,
            message_id=message_id,
            schedule_id=schedule_id,
            cron=cron,
        )

        return ProviderResult.success(
            self.name,
            Capability.QUEUE,
            data={
                "message_id": message_id,
                "schedule_id": schedule_id,
                "destination": path,
                "scheduled": bool(cron),
                "delayed": bool(delay_seconds or not_before),
            },
        )

    async def schedules(self) -> ProviderResult:
        """Every recurring job currently registered."""
        if not self.state.is_usable:
            return ProviderResult.failure(
                self.name,
                Capability.QUEUE,
                self._unavailable_detail(),
                error_code=self.state.value,
            )

        client = await self.http()
        payload = await client.get_json("/v2/schedules", operation="schedules")
        items = payload if isinstance(payload, list) else []

        return ProviderResult.success(
            self.name, Capability.QUEUE, data={"schedules": items}
        )

    async def cancel(self, schedule_id: str) -> ProviderResult:
        if not self.state.is_usable:
            return ProviderResult.failure(
                self.name,
                Capability.QUEUE,
                self._unavailable_detail(),
                error_code=self.state.value,
            )

        client = await self.http()
        await client.request("DELETE", f"/v2/schedules/{schedule_id}", operation="cancel")
        return ProviderResult.success(
            self.name, Capability.QUEUE, data={"cancelled": schedule_id}
        )
