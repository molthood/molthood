"""Safe fetcher for arbitrary, user-supplied URLs.

Everything else in `app.services` talks to a fixed, trusted host. This module
does not: the target comes from the caller, so it is the one place where
server-side request forgery is a live risk.

Three defences, all mandatory:

1. **Scheme allowlist** — only http/https. `file://`, `gopher://` and friends
   would let a caller read the host filesystem or reach odd protocols.
2. **Address filtering** — the hostname is resolved and every resulting IP is
   checked before connecting. Private, loopback, link-local and reserved
   ranges are refused, which blocks the cloud metadata endpoint
   (169.254.169.254) and anything on the internal network.
3. **Per-hop redirect validation** — redirects are followed manually. A public
   host that 302s to `http://169.254.169.254/` is the classic bypass, and
   `follow_redirects=True` would walk straight into it.

Responses are also size-capped while streaming, so a URL pointing at a
multi-gigabyte file cannot exhaust memory.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from dataclasses import dataclass
from enum import StrEnum
from urllib.parse import urlparse, urlunparse

import httpx

from app.config import get_settings
from app.core.exceptions import (
    ServiceError,
    ServiceTimeoutError,
    UnresolvableHostError,
    ValidationError,
)
from app.logging import get_logger

logger = get_logger(__name__)

ALLOWED_SCHEMES = frozenset({"http", "https"})

#: Redirect chains longer than this are treated as a loop.
MAX_REDIRECTS = 5


@dataclass(slots=True)
class FetchedResource:
    """A successfully retrieved body, already size-capped and decoded."""

    url: str
    final_url: str
    status_code: int
    content_type: str
    content: bytes
    truncated: bool
    elapsed_ms: int

    @property
    def text(self) -> str:
        return self.content.decode("utf-8", errors="replace")

    @property
    def is_html(self) -> bool:
        return "html" in self.content_type

    @property
    def is_pdf(self) -> bool:
        return "pdf" in self.content_type


class HostVerdict(StrEnum):
    """Why a hostname was accepted or refused.

    "Does not resolve" and "resolves somewhere we refuse to go" used to be the
    same answer. They are not remotely the same thing: a token declaring a
    website that does not exist is one of the most valuable findings this
    platform can produce, and it was being discarded as a security rejection.
    """

    PUBLIC = "public"
    #: No DNS record at all. A finding about the subject, not a policy refusal.
    UNRESOLVABLE = "unresolvable"
    #: Resolves, but to an address we must never connect to.
    NOT_PUBLIC = "not_public"


def resolve_host(host: str) -> HostVerdict:
    """Classify a hostname by what its DNS records actually say.

    Checking *all* results matters: a hostname can resolve to one public and
    one private address, and connecting would be a coin flip.
    """
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return HostVerdict.UNRESOLVABLE

    addresses = {info[4][0] for info in infos}
    if not addresses:
        return HostVerdict.UNRESOLVABLE

    for raw in addresses:
        try:
            ip = ipaddress.ip_address(raw)
        except ValueError:
            return HostVerdict.NOT_PUBLIC
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            return HostVerdict.NOT_PUBLIC

    return HostVerdict.PUBLIC


def normalize_url(raw: str) -> str:
    """Check a URL's shape without touching DNS.

    Split out from `validate_public_url` so a caller can hold a well-formed
    URL for a domain that does not resolve. The Site Agent needs exactly that:
    a dead domain still has registration and archive history worth reading.
    """
    candidate = (raw or "").strip()

    if not candidate:
        raise ValidationError(
            "No URL was provided.",
            suggested_action="Pass a full URL, for example https://example.com.",
        )

    # A bare domain is a common input; assume https rather than rejecting it.
    if "://" not in candidate:
        candidate = f"https://{candidate}"

    parsed = urlparse(candidate)

    if parsed.scheme not in ALLOWED_SCHEMES:
        raise ValidationError(
            f"The scheme '{parsed.scheme}' is not allowed.",
            details={"scheme": parsed.scheme},
            suggested_action="Use an http or https URL.",
        )

    if not parsed.hostname:
        raise ValidationError(
            "That URL has no hostname.",
            suggested_action="Pass a full URL, for example https://example.com.",
        )

    return urlunparse(parsed)


def validate_public_url(raw: str) -> str:
    """Normalise a caller-supplied URL and require it to be publicly routable.

    Raises `ValidationError` (422) — a rejected URL is the caller's problem,
    not a downstream outage. A non-resolving domain raises the more specific
    `UnresolvableHostError` so callers can treat it as a finding instead.
    """
    normalized = normalize_url(raw)
    parsed = urlparse(normalized)
    assert parsed.hostname is not None  # normalize_url guarantees this

    verdict = resolve_host(parsed.hostname)

    if verdict is HostVerdict.UNRESOLVABLE:
        raise UnresolvableHostError(
            f"The domain {parsed.hostname} does not resolve.",
            details={"host": parsed.hostname},
            suggested_action=(
                "The domain has no DNS records. Check the spelling, or treat "
                "its absence as the finding."
            ),
        )

    if verdict is HostVerdict.NOT_PUBLIC:
        raise ValidationError(
            "That host does not resolve to a public address.",
            details={"host": parsed.hostname},
            suggested_action=(
                "Only publicly reachable hosts can be analysed. Private, "
                "loopback, and link-local addresses are refused."
            ),
        )

    return normalized


async def resolve_host_async(host: str) -> HostVerdict:
    """Classify a hostname off the event loop — `getaddrinfo` blocks."""
    return await asyncio.to_thread(resolve_host, host)


async def validate_public_url_async(raw: str) -> str:
    """Async wrapper for `validate_public_url`.

    The check resolves DNS, and `socket.getaddrinfo` is blocking — calling it
    directly from a coroutine stalls the event loop for every other execution
    in flight. Async callers must use this.
    """
    return await asyncio.to_thread(validate_public_url, raw)


class WebFetcher:
    """Fetches arbitrary URLs under the guarantees described above."""

    def __init__(self) -> None:
        settings = get_settings()
        self._max_bytes = settings.web_fetch_max_bytes
        self._timeout = settings.web_fetch_timeout_seconds
        self._headers = {
            "user-agent": settings.web_user_agent,
            "accept": "*/*",
            "accept-encoding": "gzip, deflate",
        }
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                headers=self._headers,
                timeout=self._timeout,
                # Off by design — redirects are followed manually so each hop
                # can be re-validated against the address filter.
                follow_redirects=False,
                limits=httpx.Limits(max_connections=16),
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def fetch(
        self, url: str, *, allow_missing: bool = False
    ) -> FetchedResource | None:
        """Fetch a URL, following redirects with per-hop validation.

        Returns `None` for a 404 when `allow_missing` is set — most well-known
        files are optional, and their absence is a finding rather than an error.
        """
        import time

        client = await self._get_client()
        current = validate_public_url(url)
        started = time.perf_counter()

        for _ in range(MAX_REDIRECTS + 1):
            try:
                async with client.stream("GET", current) as response:
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            break
                        # Re-validate: the redirect target is attacker-influenced.
                        current = validate_public_url(
                            str(httpx.URL(current).join(location))
                        )
                        continue

                    if response.status_code == 404 and allow_missing:
                        return None

                    if response.status_code >= 400:
                        raise ServiceError(
                            f"{current} returned {response.status_code}.",
                            details={"url": current, "status": response.status_code},
                            suggested_action="Check the URL is reachable in a browser.",
                        )

                    chunks: list[bytes] = []
                    total = 0
                    truncated = False

                    async for chunk in response.aiter_bytes():
                        total += len(chunk)
                        if total > self._max_bytes:
                            # Stop reading rather than buffering the rest.
                            chunks.append(chunk[: self._max_bytes - (total - len(chunk))])
                            truncated = True
                            break
                        chunks.append(chunk)

                    elapsed_ms = int((time.perf_counter() - started) * 1000)
                    content_type = (
                        response.headers.get("content-type", "")
                        .split(";")[0]
                        .strip()
                        .lower()
                    )

                    return FetchedResource(
                        url=url,
                        final_url=str(response.url),
                        status_code=response.status_code,
                        content_type=content_type,
                        content=b"".join(chunks),
                        truncated=truncated,
                        elapsed_ms=elapsed_ms,
                    )

            except httpx.TimeoutException as exc:
                raise ServiceTimeoutError(
                    f"{current} did not respond within {self._timeout}s.",
                    details={"url": current},
                ) from exc
            except httpx.HTTPError as exc:
                if allow_missing:
                    return None
                raise ServiceError(
                    f"{current} could not be reached.",
                    details={"url": current, "error": type(exc).__name__},
                ) from exc

        raise ServiceError(
            f"{url} exceeded {MAX_REDIRECTS} redirects.",
            details={"url": url},
            suggested_action="The site may have a redirect loop.",
        )


#: Process-wide fetcher; the pooled client inside is created on first use.
web_fetcher = WebFetcher()
