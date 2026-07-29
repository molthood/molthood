"""Well-known site files.

Every path here is derived from the target's own origin — there is no base URL
to configure. Each file is optional, so a missing one is recorded as a finding
rather than raised as an error.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin, urlparse

from app.logging import get_logger
from app.services.web import paths
from app.services.web.fetcher import WebFetcher, validate_public_url
from app.services.web.parsers import (
    Article,
    PageMetadata,
    ParsedFeed,
    ParsedPDF,
    RobotsTxt,
    SecurityTxt,
    Sitemap,
    extract_article,
    parse_feed,
    parse_html,
    parse_pdf,
    parse_robots,
    parse_security_txt,
    parse_sitemap,
)

logger = get_logger(__name__)

#: Ceiling on one batch of optional-file probes. These are all best-effort, so
#: a slow host costs the analysis a few seconds, never the execution budget.
PROBE_BUDGET_SECONDS = 12.0

#: Ceiling on the whole profile. Past this the caller gets what was gathered.
PROFILE_BUDGET_SECONDS = 25.0


@dataclass(slots=True)
class SiteProfile:
    """Everything the site itself publishes about how it should be treated."""

    origin: str
    reachable: bool = False
    status_code: int | None = None
    final_url: str | None = None
    metadata: PageMetadata = field(default_factory=PageMetadata)
    article: Article = field(default_factory=Article)
    robots: RobotsTxt = field(default_factory=RobotsTxt)
    security: SecurityTxt = field(default_factory=SecurityTxt)
    sitemap: Sitemap = field(default_factory=Sitemap)
    feed: ParsedFeed = field(default_factory=ParsedFeed)
    favicon_url: str | None = None
    favicon_bytes: int | None = None
    errors: dict[str, str] = field(default_factory=dict)


class SiteClient:
    """Reads a site's public, self-declared surface."""

    def __init__(self, fetcher: WebFetcher) -> None:
        self._fetcher = fetcher

    @staticmethod
    def origin_of(url: str) -> str:
        parsed = urlparse(validate_public_url(url))
        return f"{parsed.scheme}://{parsed.netloc}"

    async def profile(self, url: str) -> SiteProfile:
        """Fetch the landing page and every well-known file, in parallel.

        Bounded overall: a partial profile is a useful result, a stalled
        execution is not.
        """
        try:
            async with asyncio.timeout(PROFILE_BUDGET_SECONDS):
                return await self._profile(url)
        except TimeoutError:
            logger.warning("site_profile_timeout", url=url)
            profile = SiteProfile(origin=self.origin_of(url))
            profile.errors["profile"] = "timeout"
            return profile

    async def _profile(self, url: str) -> SiteProfile:
        origin = self.origin_of(url)
        profile = SiteProfile(origin=origin)

        page, robots, security, sitemap = await asyncio.gather(
            self._page(url, profile),
            self._robots(origin),
            self._security_txt(origin),
            self._sitemap(origin),
            return_exceptions=True,
        )

        if isinstance(robots, RobotsTxt):
            profile.robots = robots
        if isinstance(security, SecurityTxt):
            profile.security = security
        if isinstance(sitemap, Sitemap):
            profile.sitemap = sitemap

        # A robots.txt Sitemap: directive is authoritative — prefer it over the
        # conventional /sitemap.xml guess when the guess found nothing.
        if not profile.sitemap.present and profile.robots.sitemaps:
            declared = await self._fetch_sitemap(profile.robots.sitemaps[0], origin)
            if declared is not None:
                profile.sitemap = declared

        await asyncio.gather(
            self._favicon(profile),
            self._feed(profile),
            return_exceptions=True,
        )

        return profile

    async def _page(self, url: str, profile: SiteProfile) -> None:
        try:
            resource = await self._fetcher.fetch(url)
        except Exception as exc:
            profile.errors["page"] = type(exc).__name__
            return

        if resource is None:
            profile.errors["page"] = "not_found"
            return

        profile.reachable = True
        profile.status_code = resource.status_code
        profile.final_url = resource.final_url

        if resource.is_html:
            html = resource.text
            profile.metadata = parse_html(html, resource.final_url)
            profile.article = extract_article(html)

    async def _robots(self, origin: str) -> RobotsTxt:
        resource = await self._safe_fetch(urljoin(origin, paths.ROBOTS_TXT))
        return parse_robots(resource.text) if resource else RobotsTxt()

    async def _security_txt(self, origin: str) -> SecurityTxt:
        # The .well-known location is canonical; the root path is a fallback.
        for path in paths.SECURITY_TXT:
            resource = await self._safe_fetch(urljoin(origin, path))
            if resource is not None:
                return parse_security_txt(resource.text)
        return SecurityTxt()

    async def _sitemap(self, origin: str) -> Sitemap:
        result = await self._fetch_sitemap(urljoin(origin, paths.SITEMAP_XML), origin)
        return result or Sitemap()

    async def _fetch_sitemap(self, url: str, origin: str) -> Sitemap | None:
        resource = await self._safe_fetch(urljoin(origin, url))
        return parse_sitemap(resource.content) if resource else None

    async def _probe_all(self, candidates: list[str]) -> list[Any]:
        """Try every candidate at once and return whatever answered.

        Sequential probing was the original approach and it does not scale:
        six feed fallbacks at a 15s timeout each is a 90s worst case, which
        overran the execution budget on real sites. In parallel the worst case
        is one timeout, and the whole set is additionally bounded below.
        """
        if not candidates:
            return []

        try:
            async with asyncio.timeout(PROBE_BUDGET_SECONDS):
                results = await asyncio.gather(
                    *(self._safe_fetch(candidate) for candidate in candidates),
                    return_exceptions=True,
                )
        except TimeoutError:
            return []

        return [r for r in results if r is not None and not isinstance(r, BaseException)]

    async def _favicon(self, profile: SiteProfile) -> None:
        """Prefer a declared icon; fall back to the conventional /favicon.ico."""
        candidates = [
            *profile.metadata.icon_urls[:3],
            urljoin(profile.origin, paths.FAVICON_ICO),
        ]

        for resource in await self._probe_all(candidates):
            if resource.content:
                profile.favicon_url = resource.final_url
                profile.favicon_bytes = len(resource.content)
                return

    async def _feed(self, profile: SiteProfile) -> None:
        """Declared feeds first; conventional paths only if none were declared."""
        candidates = list(profile.metadata.feed_urls[:3])
        if not candidates:
            candidates = [urljoin(profile.origin, path) for path in paths.FEED_FALLBACKS]

        for resource in await self._probe_all(candidates):
            if not resource.content:
                continue
            parsed = parse_feed(resource.content)
            if parsed.entry_count:
                profile.feed = parsed
                return

    async def _safe_fetch(self, url: str) -> Any:
        """Fetch an optional resource; absence and failure are both `None`."""
        try:
            return await self._fetcher.fetch(url, allow_missing=True)
        except Exception:
            return None

    async def read_pdf(self, url: str) -> ParsedPDF:
        """Fetch and extract a PDF — used for whitepapers and audit reports."""
        resource = await self._fetcher.fetch(url)
        if resource is None or not resource.is_pdf:
            return ParsedPDF()
        return parse_pdf(resource.content)
