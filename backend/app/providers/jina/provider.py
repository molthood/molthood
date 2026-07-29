"""Jina Reader.

Turns a URL into clean markdown by prefixing it with `r.jina.ai/`. The only
provider in this layer that works **without** a credential — anonymous use is
rate-limited rather than refused — which makes it the natural last resort when
every keyed reader is missing or throttled.

That property is encoded rather than described: `required_env` is empty, so
the manager reports it usable on a deployment with no keys at all.
"""

from __future__ import annotations

from typing import Any, ClassVar
from urllib.parse import urlparse

from app.core.exceptions import ValidationError
from app.providers.base import Provider
from app.providers.types import Capability, ProviderResult
from app.services.http import TimeoutPolicy

#: Reader fetches and renders the target page, so it is slower than an API call
#: and needs a budget of its own.
_TIMEOUT = TimeoutPolicy(connect_seconds=5.0, read_seconds=45.0)


class JinaProvider(Provider):
    """URL to clean markdown, with or without a key."""

    name: ClassVar[str] = "jina"
    title: ClassVar[str] = "Jina Reader"
    description: ClassVar[str] = (
        "Converts a URL to clean markdown. Works anonymously — a key only "
        "raises the rate limit — so it is the fallback when keyed readers are "
        "unavailable."
    )
    capabilities: ClassVar[tuple[Capability, ...]] = (Capability.READ_URL,)

    #: Reading a page means rendering it. Measured at ~1s warm and over 8s
    #: cold, which the shared ceiling reported as an outage.
    probe_timeout: ClassVar[float] = 20.0
    #: Deliberately empty. A key is optional here, and requiring one would take
    #: the only always-available reader out of a keyless deployment.
    required_env: ClassVar[tuple[str, ...]] = ()

    def __init__(self, **kwargs: Any) -> None:
        kwargs.setdefault("timeout", _TIMEOUT)
        super().__init__(**kwargs)

    @property
    def has_credentials(self) -> bool:
        # Always true: anonymous access is a supported mode, not a degraded one.
        return True

    def auth_headers(self) -> dict[str, str]:
        headers = {"accept": "text/plain"}
        if self._api_key is not None:
            headers["authorization"] = f"Bearer {self.key}"
        return headers

    @property
    def is_authenticated(self) -> bool:
        """Whether a key is raising the rate limit."""
        return self._api_key is not None

    async def _probe(self) -> str:
        client = await self.http()
        await client.get_text("/https://example.com", operation="probe")
        return (
            "Reader responding (authenticated)."
            if self.is_authenticated
            else "Reader responding (anonymous, rate-limited)."
        )

    async def _perform(self, capability: Capability, /, **kwargs: Any) -> ProviderResult:
        return await self._read(**kwargs)

    async def _read(self, *, url: str, **_: Any) -> ProviderResult:
        target = _validated(url)

        client = await self.http()
        # Reader answers text/plain markdown; `get_json` would reject it, so
        # this reads the body directly through the same resilient transport.
        text = await client.get_text(
            f"/{target}",
            headers={"accept": "text/plain", "x-return-format": "markdown"},
            operation="read",
        )

        warnings: list[str] = []
        if not self.is_authenticated:
            warnings.append("Read anonymously. Set JINA_API_KEY to raise the rate limit.")

        return ProviderResult.success(
            self.name,
            Capability.READ_URL,
            data={"url": target, "text": text, "format": "markdown"},
            citations=[{"url": target, "provider": self.name}],
            warnings=warnings,
        )


def _validated(url: str) -> str:
    """Reject anything that is not a public http(s) URL.

    Reader takes the target in the path, so an unvalidated value would let a
    caller aim this at an internal address and have the response handed back —
    a server-side request forgery with the result attached.
    """
    parsed = urlparse(url if "://" in url else f"https://{url}")

    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValidationError(
            "Jina Reader needs a public http(s) URL.",
            details={"url": url[:200]},
        )

    host = parsed.hostname.lower()
    if host in ("localhost", "127.0.0.1", "::1") or host.endswith(".local"):
        raise ValidationError(
            "Refusing to read a loopback or link-local address.",
            details={"host": host},
        )

    return parsed.geturl()
