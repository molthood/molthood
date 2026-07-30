"""Firecrawl.

The heaviest reader in this layer: it renders the page in a browser, so it
reaches content that a plain fetch cannot. That is also why it is not the
default — a rendered scrape costs far more than Jina reading the same URL, and
the router should reach for it when JavaScript is actually in the way.

Written against the documented **v2** shapes (`/v2/scrape`, `/v2/search`,
`/v2/crawl`, `/v2/extract`, `/v2/map`). Not yet run against the live API;
there is no credential.
"""

from __future__ import annotations

from typing import Any, ClassVar

from app.providers.base import Provider
from app.providers.types import Capability, ProviderResult
from app.services.http import TimeoutPolicy

#: Rendering a page takes far longer than an API call.
_TIMEOUT = TimeoutPolicy(connect_seconds=5.0, read_seconds=90.0)

DEFAULT_RESULTS = 8
#: Pages followed from a root in one crawl. Bounded because a crawl is billed
#: per page and an unbounded root can be very large.
DEFAULT_CRAWL_LIMIT = 15
MAX_CRAWL_LIMIT = 100


class FirecrawlProvider(Provider):
    """Rendered scraping, crawling, structured extraction, and screenshots."""

    name: ClassVar[str] = "firecrawl"
    title: ClassVar[str] = "Firecrawl"
    description: ClassVar[str] = (
        "Renders pages in a browser, so it reaches content a plain fetch "
        "cannot. Also crawls a site, extracts structured fields, and captures "
        "screenshots."
    )
    capabilities: ClassVar[tuple[Capability, ...]] = (
        Capability.READ_URL,
        Capability.MAP_SITE,
        Capability.CRAWL_SITE,
        Capability.EXTRACT_STRUCTURED,
        Capability.SCREENSHOT,
        Capability.WEB_SEARCH,
    )
    required_env: ClassVar[tuple[str, ...]] = ("FIRECRAWL_API_KEY",)

    #: Reading a page means rendering it. Measured at ~1s warm and over 8s
    #: cold, which the shared ceiling reported as an outage.
    probe_timeout: ClassVar[float] = 20.0

    def __init__(self, **kwargs: Any) -> None:
        kwargs.setdefault("timeout", _TIMEOUT)
        super().__init__(**kwargs)

    @property
    def version(self) -> str | None:
        return "v2"

    async def _probe(self) -> str:
        """Map is the cheapest authenticated call — it lists URLs without
        rendering any of them, so a health check costs no page credit."""
        client = await self.http()
        await client.post_json(
            "/v2/map",
            json_body={"url": "https://example.com", "limit": 1},
            operation="probe",
        )
        return "Scrape API responding."

    async def _perform(self, capability: Capability, /, **kwargs: Any) -> ProviderResult:
        if capability is Capability.MAP_SITE:
            return await self._map(**kwargs)
        if capability is Capability.CRAWL_SITE:
            return await self._crawl(**kwargs)
        if capability is Capability.EXTRACT_STRUCTURED:
            return await self._extract(**kwargs)
        if capability is Capability.SCREENSHOT:
            return await self._scrape(capability, formats=["screenshot"], **kwargs)
        if capability is Capability.WEB_SEARCH:
            return await self._search(**kwargs)
        return await self._scrape(capability, formats=["markdown"], **kwargs)

    # --- operations --------------------------------------------------------

    async def _scrape(
        self,
        capability: Capability,
        *,
        url: str,
        formats: list[str],
        only_main_content: bool = True,
        **_: Any,
    ) -> ProviderResult:
        client = await self.http()
        payload = await client.post_json(
            "/v2/scrape",
            json_body={
                "url": url,
                "formats": formats,
                "onlyMainContent": only_main_content,
            },
            operation="scrape",
        )

        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, dict):
            return ProviderResult.failure(
                self.name,
                capability,
                "Firecrawl returned no data for that URL.",
                error_code="empty_result",
            )

        raw_metadata = data.get("metadata")
        metadata: dict[str, Any] = raw_metadata if isinstance(raw_metadata, dict) else {}

        return ProviderResult.success(
            self.name,
            capability,
            data={
                "url": url,
                "title": metadata.get("title"),
                "description": metadata.get("description"),
                "status_code": metadata.get("statusCode"),
                "text": data.get("markdown"),
                "screenshot": data.get("screenshot"),
            },
            citations=[
                {"url": url, "title": metadata.get("title"), "provider": self.name}
            ],
        )

    async def _map(
        self, *, url: str, limit: int = 200, search: str = "", **_: Any
    ) -> ProviderResult:
        """Every URL a site exposes, without fetching any of them.

        This is the step that makes crawling optional. A crawl renders each
        page and bills for it; a map returns the shape of the site in one call,
        which is enough to answer "how big is this", "is there documentation",
        "does a pricing page exist" — and enough to choose the handful of pages
        actually worth reading.

        `search` narrows the result server-side, so finding the docs section of
        a large site does not mean pulling ten thousand URLs to filter locally.
        """
        client = await self.http()
        body: dict[str, Any] = {"url": url, "limit": min(max(1, limit), 5000)}
        if search:
            body["search"] = search

        payload = await client.post_json("/v2/map", json_body=body, operation="map")

        links = payload.get("links") if isinstance(payload, dict) else None
        if not isinstance(links, list):
            return ProviderResult.failure(
                self.name,
                Capability.MAP_SITE,
                "Firecrawl returned no link list for this site.",
                error_code="map_empty",
            )

        # The shape varies: entries are either bare strings or objects carrying
        # a title. Both are normalised here so callers never branch on it.
        urls: list[dict[str, Any]] = []
        for link in links:
            if isinstance(link, str):
                urls.append({"url": link, "title": None, "description": None})
            elif isinstance(link, dict) and link.get("url"):
                urls.append(
                    {
                        "url": link["url"],
                        "title": link.get("title"),
                        "description": link.get("description"),
                    }
                )

        return ProviderResult.success(
            self.name,
            Capability.MAP_SITE,
            data={"url": url, "urls": urls, "total": len(urls), "search": search or None},
        )

    async def _crawl(
        self, *, url: str, limit: int = DEFAULT_CRAWL_LIMIT, **_: Any
    ) -> ProviderResult:
        client = await self.http()
        payload = await client.post_json(
            "/v2/crawl",
            json_body={
                "url": url,
                "limit": min(max(1, limit), MAX_CRAWL_LIMIT),
                "scrapeOptions": {"formats": ["markdown"], "onlyMainContent": True},
            },
            operation="crawl",
        )

        # A crawl is asynchronous: the POST returns a job id, and the pages
        # arrive later. The id is handed back rather than polled here, so a
        # long crawl does not hold an HTTP request open for minutes.
        if isinstance(payload, dict) and payload.get("id"):
            return ProviderResult.success(
                self.name,
                Capability.CRAWL_SITE,
                data={
                    "url": url,
                    "job_id": payload["id"],
                    "status_url": payload.get("url"),
                    "state": "accepted",
                },
                warnings=["Crawling runs asynchronously. Poll the job id for pages."],
            )

        return ProviderResult.failure(
            self.name,
            Capability.CRAWL_SITE,
            "Firecrawl did not accept the crawl.",
            error_code="crawl_rejected",
        )

    async def crawl_status(self, job_id: str) -> ProviderResult:
        """Pages gathered so far by an accepted crawl."""
        if not self.state.is_usable:
            return ProviderResult.failure(
                self.name,
                Capability.CRAWL_SITE,
                self._unavailable_detail(),
                error_code=self.state.value,
            )

        client = await self.http()
        payload = await client.get_json(f"/v2/crawl/{job_id}", operation="crawl_status")

        if not isinstance(payload, dict):
            return ProviderResult.failure(
                self.name,
                Capability.CRAWL_SITE,
                "Firecrawl returned an unreadable crawl status.",
                error_code="invalid_response",
            )

        raw_pages = payload.get("data")
        pages: list[Any] = raw_pages if isinstance(raw_pages, list) else []
        return ProviderResult.success(
            self.name,
            Capability.CRAWL_SITE,
            data={
                "job_id": job_id,
                "state": payload.get("status"),
                "completed": payload.get("completed"),
                "total": payload.get("total"),
                "pages": pages,
            },
            citations=[
                {"url": _page_url(page), "provider": self.name}
                for page in pages
                if _page_url(page)
            ],
        )

    async def _extract(
        self, *, urls: list[str], schema: dict[str, Any], prompt: str = "", **_: Any
    ) -> ProviderResult:
        client = await self.http()
        body: dict[str, Any] = {"urls": urls, "schema": schema}
        if prompt:
            body["prompt"] = prompt

        payload = await client.post_json(
            "/v2/extract", json_body=body, operation="extract"
        )

        return ProviderResult.success(
            self.name,
            Capability.EXTRACT_STRUCTURED,
            data=payload.get("data") if isinstance(payload, dict) else payload,
            citations=[{"url": url, "provider": self.name} for url in urls],
        )

    async def _search(
        self, *, query: str, limit: int = DEFAULT_RESULTS, **_: Any
    ) -> ProviderResult:
        client = await self.http()
        payload = await client.post_json(
            "/v2/search",
            json_body={"query": query, "limit": limit},
            operation="search",
        )

        raw = payload.get("data") if isinstance(payload, dict) else None
        items = raw if isinstance(raw, list) else []

        results = [
            {
                "url": item.get("url"),
                "title": item.get("title"),
                "text": item.get("description") or item.get("markdown"),
            }
            for item in items
            if isinstance(item, dict)
        ]

        return ProviderResult.success(
            self.name,
            Capability.WEB_SEARCH,
            data={"query": query, "results": results},
            citations=[
                {"url": item["url"], "title": item["title"], "provider": self.name}
                for item in results
                if item.get("url")
            ],
        )


def _page_url(page: Any) -> str | None:
    if not isinstance(page, dict):
        return None
    metadata = page.get("metadata")
    if isinstance(metadata, dict):
        url = metadata.get("sourceURL") or metadata.get("url")
        return url if isinstance(url, str) else None
    return None
