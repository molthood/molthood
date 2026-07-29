"""Resilient async HTTP transport shared by every service client.

One place owns retries, backoff, timeouts, error translation, logging, and
response validation. Clients describe *what* to call; this module decides how
the call behaves when the network misbehaves.
"""

from __future__ import annotations

import asyncio
import random
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel
from pydantic import ValidationError as PydanticValidationError

from app.core.exceptions import (
    ServiceAuthError,
    ServiceError,
    ServiceRateLimitError,
    ServiceResponseError,
    ServiceTimeoutError,
    ServiceUnavailableError,
    UpstreamNotFoundError,
)
from app.logging import get_logger

logger = get_logger(__name__)

ModelT = TypeVar("ModelT", bound=BaseModel)


def user_agent() -> str:
    """What every outbound request announces itself as.

    Both upstream hosts sit behind Cloudflare, which 403s the default
    `python-httpx/x.y` agent, so a named agent is required rather than
    cosmetic.

    Read from settings rather than frozen into a constant. It was a constant,
    and the result was two of them: this one and `WEB_USER_AGENT`, disagreeing
    about both the version and the domain. A site operator reading their logs
    would have seen two different callers.
    """
    from app.config import get_settings

    return get_settings().web_user_agent


#: Status codes worth retrying — transient by nature.
RETRYABLE_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})


@dataclass(frozen=True, slots=True)
class RetryPolicy:
    """How many times to retry and how long to wait between attempts."""

    max_attempts: int = 3
    backoff_base_seconds: float = 0.25
    backoff_max_seconds: float = 4.0
    #: Random fraction added to each delay so retries from concurrent callers
    #: do not align into a thundering herd.
    jitter: float = 0.25

    def delay_for(self, attempt: int) -> float:
        # 2.0 rather than 2: `int ** int` widens to Any under strict typing.
        raw = self.backoff_base_seconds * (2.0 ** (attempt - 1))
        capped = min(raw, self.backoff_max_seconds)
        return capped * (1 + random.random() * self.jitter)


@dataclass(frozen=True, slots=True)
class TimeoutPolicy:
    connect_seconds: float = 5.0
    read_seconds: float = 15.0

    def to_httpx(self) -> httpx.Timeout:
        return httpx.Timeout(
            connect=self.connect_seconds,
            read=self.read_seconds,
            write=self.read_seconds,
            pool=self.connect_seconds,
        )


class ResilientHTTPClient:
    """Async HTTP client with retry, backoff, and structured error translation.

    Every exception it raises is a `ServiceError` subclass carrying a code and
    a suggested action — callers never see a raw `httpx` exception.
    """

    def __init__(
        self,
        *,
        service: str,
        base_url: str = "",
        headers: dict[str, str] | None = None,
        retry: RetryPolicy | None = None,
        timeout: TimeoutPolicy | None = None,
    ) -> None:
        self.service = service
        self.base_url = base_url.rstrip("/")
        self.retry = retry or RetryPolicy()
        self.timeout = timeout or TimeoutPolicy()
        self._headers = {
            "accept": "application/json",
            "user-agent": user_agent(),
            **(headers or {}),
        }
        self._client: httpx.AsyncClient | None = None
        self._lock = asyncio.Lock()

    async def _get_client(self) -> httpx.AsyncClient:
        """Create the pooled client on first use, once even under concurrency."""
        if self._client is None:
            async with self._lock:
                if self._client is None:
                    self._client = httpx.AsyncClient(
                        base_url=self.base_url,
                        headers=self._headers,
                        timeout=self.timeout.to_httpx(),
                        follow_redirects=True,
                        limits=httpx.Limits(
                            max_connections=32, max_keepalive_connections=16
                        ),
                    )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def request(
        self,
        method: str,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: Any | None = None,
        content: str | bytes | None = None,
        headers: dict[str, str] | None = None,
        operation: str = "",
        as_text: bool = False,
    ) -> Any:
        """Perform a request and return the decoded JSON body.

        Retries transient failures according to the retry policy, then raises a
        structured `ServiceError`.

        `headers` merges over the client's own for this call only. Most
        services authenticate with a header fixed at construction; GoPlus
        rotates a short-lived token, so it needs to vary per request.

        `content` sends a body verbatim, for APIs that take a raw value rather
        than a JSON document — Upstash Redis stores exactly the bytes it is
        given, so wrapping them as JSON would store the quotes too.

        `as_text` returns the body undecoded. Jina Reader answers `text/plain`
        markdown, and treating that as a malformed JSON response would fail a
        call that in fact succeeded.
        """
        client = await self._get_client()
        log = logger.bind(service=self.service, operation=operation or url)
        last_error: Exception | None = None

        for attempt in range(1, self.retry.max_attempts + 1):
            started = time.perf_counter()

            try:
                response = await client.request(
                    method,
                    url,
                    params=params,
                    json=json_body,
                    content=content,
                    headers=headers,
                )
            except httpx.TimeoutException as exc:
                last_error = exc
                log.warning("service_timeout", attempt=attempt, error=str(exc))
                if attempt == self.retry.max_attempts:
                    raise ServiceTimeoutError(
                        f"{self.service} timed out after {attempt} attempts.",
                        details={"service": self.service, "operation": operation},
                    ) from exc
                await asyncio.sleep(self.retry.delay_for(attempt))
                continue
            except httpx.HTTPError as exc:
                last_error = exc
                log.warning("service_transport_error", attempt=attempt, error=str(exc))
                if attempt == self.retry.max_attempts:
                    raise ServiceUnavailableError(
                        f"{self.service} could not be reached.",
                        details={"service": self.service, "operation": operation},
                    ) from exc
                await asyncio.sleep(self.retry.delay_for(attempt))
                continue

            duration_ms = round((time.perf_counter() - started) * 1000, 2)

            if response.status_code in RETRYABLE_STATUS:
                retry_after = _retry_after_seconds(response)
                log.warning(
                    "service_retryable_status",
                    attempt=attempt,
                    status_code=response.status_code,
                    duration_ms=duration_ms,
                    retry_after=retry_after,
                )
                if attempt == self.retry.max_attempts:
                    raise self._error_for_status(response, operation)
                # Honour an explicit Retry-After over our own backoff curve.
                await asyncio.sleep(retry_after or self.retry.delay_for(attempt))
                continue

            if response.status_code >= 400:
                log.warning(
                    "service_error_status",
                    status_code=response.status_code,
                    duration_ms=duration_ms,
                )
                raise self._error_for_status(response, operation)

            log.info(
                "service_call_ok",
                status_code=response.status_code,
                duration_ms=duration_ms,
                attempt=attempt,
            )
            if as_text:
                return response.text
            return _decode_json(response, self.service, operation)

        # Unreachable: every branch above either returns or raises.
        raise ServiceError(
            f"{self.service} failed after {self.retry.max_attempts} attempts.",
            details={"service": self.service, "operation": operation},
        ) from last_error

    async def get_json(
        self,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        operation: str = "",
    ) -> Any:
        return await self.request(
            "GET", url, params=params, headers=headers, operation=operation
        )

    async def get_text(
        self,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        operation: str = "",
    ) -> str:
        """GET a body that is not JSON — markdown, plain text, HTML."""
        body = await self.request(
            "GET",
            url,
            params=params,
            headers=headers,
            operation=operation,
            as_text=True,
        )
        return body if isinstance(body, str) else str(body)

    async def post_json(
        self,
        url: str,
        *,
        json_body: Any,
        operation: str = "",
    ) -> Any:
        return await self.request("POST", url, json_body=json_body, operation=operation)

    async def get_model(
        self,
        url: str,
        model: type[ModelT],
        *,
        params: dict[str, Any] | None = None,
        operation: str = "",
    ) -> ModelT:
        """GET and validate the body against `model`."""
        payload = await self.get_json(url, params=params, operation=operation)
        return validate_response(
            payload, model, service=self.service, operation=operation
        )

    async def stream_lines(
        self,
        method: str,
        url: str,
        *,
        json_body: Any | None = None,
        operation: str = "",
    ) -> AsyncIterator[str]:
        """Yield response lines as they arrive, without buffering the body.

        Deliberately outside the retry path. Once a caller has consumed part of
        a stream, replaying the request would hand it the opening tokens twice;
        a half-delivered summary silently restarting mid-sentence is worse than
        a clean failure. Callers get one attempt and a typed error.
        """
        client = await self._get_client()
        log = logger.bind(service=self.service, operation=operation or url)
        started = time.perf_counter()

        try:
            async with client.stream(method, url, json=json_body) as response:
                if response.status_code >= 400:
                    # The body has not been read yet, and the error translator
                    # may want it. Read before raising or httpx refuses access.
                    await response.aread()
                    raise self._error_for_status(response, operation)

                async for line in response.aiter_lines():
                    yield line

            log.info(
                "service_stream_ok",
                duration_ms=round((time.perf_counter() - started) * 1000, 2),
            )
        except httpx.TimeoutException as exc:
            raise ServiceTimeoutError(
                f"{self.service} timed out while streaming.",
                details={"service": self.service, "operation": operation},
            ) from exc
        except httpx.HTTPError as exc:
            raise ServiceUnavailableError(
                f"{self.service} could not be reached.",
                details={"service": self.service, "operation": operation},
            ) from exc

    def _error_for_status(self, response: httpx.Response, operation: str) -> ServiceError:
        """Translate an HTTP status into a typed, actionable error."""
        details: dict[str, Any] = {
            "service": self.service,
            "operation": operation,
            "status_code": response.status_code,
        }
        status = response.status_code

        if status == 404:
            raise UpstreamNotFoundError(
                f"{self.service} has no record for this request.",
                details=details,
            )
        if status in (401, 403):
            return ServiceAuthError(
                f"{self.service} rejected the request ({status}).", details=details
            )
        if status == 429:
            details["retry_after"] = _retry_after_seconds(response)
            return ServiceRateLimitError(
                f"{self.service} rate-limited the request.", details=details
            )
        if status >= 500:
            return ServiceUnavailableError(
                f"{self.service} returned {status}.", details=details
            )
        return ServiceError(f"{self.service} returned {status}.", details=details)


def _retry_after_seconds(response: httpx.Response) -> float | None:
    raw = response.headers.get("retry-after")
    if not raw:
        return None
    try:
        # Cap it: a hostile or buggy header must not stall a request forever.
        return min(float(raw), 10.0)
    except ValueError:
        return None


def _decode_json(response: httpx.Response, service: str, operation: str) -> Any:
    try:
        return response.json()
    except ValueError as exc:
        raise ServiceResponseError(
            f"{service} returned a non-JSON body.",
            details={
                "service": service,
                "operation": operation,
                "content_type": response.headers.get("content-type"),
            },
        ) from exc


def validate_response(
    payload: Any,
    model: type[ModelT],
    *,
    service: str,
    operation: str = "",
) -> ModelT:
    """Validate an external payload, converting failures into service errors.

    An upstream shape change is a *dependency* problem, not a bug in the
    caller's request — so it surfaces as 502, never as a 500 traceback.
    """
    try:
        return model.model_validate(payload)
    except PydanticValidationError as exc:
        logger.warning(
            "service_response_invalid",
            service=service,
            operation=operation,
            errors=exc.error_count(),
        )
        raise ServiceResponseError(
            f"{service} returned a response that did not match the expected shape.",
            details={
                "service": service,
                "operation": operation,
                "validation_errors": exc.error_count(),
            },
        ) from exc
