"""Web intelligence registry.

Deliberately separate from `ServiceRegistry`. That registry health-probes every
member on each `/api/v1/status` call, and crt.sh alone takes 30 seconds — a
probe there would either time out and report a working service as down, or hold
the status endpoint open far too long.

These clients are also *optional* to an execution: none of them is required for
an on-chain analysis to succeed.
"""

from __future__ import annotations

import asyncio
from functools import lru_cache
from typing import Any

from app.config import get_settings
from app.logging import get_logger
from app.services.goplus import GoPlusClient
from app.services.signatures import SignatureClient
from app.services.web.fetcher import WebFetcher
from app.services.web.intel import (
    CrtShClient,
    DoHClient,
    GitHubClient,
    MicrolinkClient,
    OpenGraphClient,
    RDAPClient,
    WaybackClient,
)
from app.services.web.site import SiteClient

logger = get_logger(__name__)


class WebIntelRegistry:
    """Holds one instance of every web-intelligence client."""

    def __init__(self) -> None:
        settings = get_settings()

        self.fetcher = WebFetcher()
        self.site = SiteClient(self.fetcher)
        self.microlink = MicrolinkClient(settings.microlink_base_url)
        self.opengraph = OpenGraphClient(
            settings.opengraph_base_url, settings.opengraph_api_key
        )
        self.dns = DoHClient(settings.doh_base_url)
        self.rdap = RDAPClient(settings.rdap_bootstrap_url)
        self.crtsh = CrtShClient(settings.crtsh_base_url, settings.crtsh_timeout_seconds)
        self.wayback = WaybackClient(
            settings.wayback_availability_url, settings.wayback_cdx_url
        )
        self.github = GitHubClient(
            settings.github_api_base_url,
            settings.github_raw_base_url,
            settings.github_token,
        )
        # Lives here rather than in `ServiceRegistry` for the same reason the
        # rest of this module does: it is optional to an execution, and it must
        # not be health-probed on every `/status` call.
        self.goplus = GoPlusClient(settings.goplus_app_key, settings.goplus_app_secret)
        # Reverse index for four-byte selectors. Its whole purpose is the
        # contract nobody verified, so it must not become a dependency an
        # analysis can fail on.
        self.signatures = SignatureClient(base_url=settings.openchain_base_url)

    def describe(self) -> list[dict[str, Any]]:
        """Static capability report — no network calls.

        `/api/v1/status` uses this instead of probing, so the endpoint stays
        fast regardless of how slow an upstream is today.
        """
        settings = get_settings()

        return [
            {
                "name": "microlink",
                "endpoint": settings.microlink_base_url,
                "requires_key": False,
                "detail": "Link preview metadata (public tier).",
            },
            {
                "name": "opengraph",
                "endpoint": settings.opengraph_base_url,
                "requires_key": True,
                "detail": (
                    "Independent read of the same declared metadata, used to "
                    f"corroborate Microlink. Configured: {self.opengraph.configured}."
                ),
            },
            {
                "name": "dns_over_https",
                "endpoint": settings.doh_base_url,
                "requires_key": False,
                "detail": "A/AAAA/MX/NS/TXT/CAA plus SPF, DMARC and DNSSEC signals.",
            },
            {
                "name": "rdap",
                "endpoint": settings.rdap_bootstrap_url,
                "requires_key": False,
                "detail": "Registration data via the IANA bootstrap registry.",
            },
            {
                "name": "crtsh",
                "endpoint": settings.crtsh_base_url,
                "requires_key": False,
                "detail": (
                    f"Certificate transparency. Slow by nature — "
                    f"{settings.crtsh_timeout_seconds:.0f}s budget, no retry."
                ),
            },
            {
                "name": "wayback",
                "endpoint": settings.wayback_availability_url,
                "requires_key": False,
                "detail": "Internet Archive availability and capture history.",
            },
            {
                "name": "github",
                "endpoint": settings.github_api_base_url,
                "requires_key": False,
                "detail": (
                    "Repository metadata and raw files. Authenticated: "
                    f"{self.github.has_token} (a token only raises the rate limit)."
                ),
            },
            {
                "name": "goplus",
                "endpoint": self.goplus.base_url,
                "requires_key": False,
                "detail": (
                    "Token tradability: honeypot, taxes, pausable transfers, "
                    "hidden owner. Works anonymously (throttled after ~10 "
                    f"requests). Auth: {self.goplus.credential_state}."
                ),
            },
            {
                "name": "openchain",
                "endpoint": settings.openchain_base_url,
                "requires_key": False,
                "detail": (
                    "Four-byte selector registry. Recovers what an unverified "
                    "contract can do from its deployed bytecode, so the power "
                    "scan is not blank for the ~12% of tokens with no source."
                ),
            },
            {
                "name": "site_files",
                "endpoint": "derived from the target origin",
                "requires_key": False,
                "detail": (
                    "robots.txt, security.txt, sitemap.xml, favicon and feeds — "
                    "well-known paths, so no endpoint is configured."
                ),
            },
        ]

    async def aclose(self) -> None:
        await asyncio.gather(
            self.fetcher.aclose(),
            self.microlink.aclose(),
            self.opengraph.aclose(),
            self.dns.aclose(),
            self.rdap.aclose(),
            self.crtsh.aclose(),
            self.wayback.aclose(),
            self.github.aclose(),
            self.goplus.aclose(),
            self.signatures.aclose(),
            return_exceptions=True,
        )


@lru_cache(maxsize=1)
def get_web_registry() -> WebIntelRegistry:
    return WebIntelRegistry()
