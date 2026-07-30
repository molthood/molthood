"""Exa.

Retrieval by meaning rather than keyword, plus "pages like this one". Its
distinguishing feature for this platform is that results carry the page text,
so a search and a read are one round trip instead of two.

Written against the documented v1 shapes (`POST /search`, `/findSimilar`,
`/contents`). Unlike every other integration here, it has **not** been run
against the live API — there is no credential yet, and this file exists so
that adding one is the only remaining step. The parsing is deliberately
tolerant for that reason: unknown fields are ignored and missing ones become
None rather than raising.
"""

from __future__ import annotations

from typing import Any, ClassVar

from app.providers.base import Provider
from app.providers.types import Capability, ProviderResult

#: Exa authenticates with its own header rather than a bearer token.
_KEY_HEADER = "x-api-key"

DEFAULT_RESULTS = 8
MAX_RESULTS = 25


class ExaProvider(Provider):
    """Semantic search, similar-page lookup, and content retrieval."""

    name: ClassVar[str] = "exa"
    title: ClassVar[str] = "Exa"
    description: ClassVar[str] = (
        "Search by meaning rather than keyword. Returns page text with each "
        "result, so a search and a read are one call."
    )
    capabilities: ClassVar[tuple[Capability, ...]] = (
        Capability.WEB_SEARCH,
        Capability.SEMANTIC_SEARCH,
        Capability.SIMILAR_PAGES,
        Capability.READ_URL,
        Capability.READ_MANY,
        Capability.SEARCH_WITH_CONTENT,
    )
    required_env: ClassVar[tuple[str, ...]] = ("EXA_API_KEY",)

    @property
    def version(self) -> str | None:
        return "v1"

    def auth_headers(self) -> dict[str, str]:
        if self._api_key is None:
            return {}
        return {_KEY_HEADER: self.key}

    async def _probe(self) -> str:
        """One minimal search. Exa has no dedicated health route.

        `numResults=1` keeps the probe as cheap as the API allows — a health
        check that costs a full search would make the status page expensive to
        open.
        """
        client = await self.http()
        await client.post_json(
            "/search",
            json_body={"query": "molthood health probe", "numResults": 1},
            operation="probe",
        )
        return "Search responding."

    async def _perform(self, capability: Capability, /, **kwargs: Any) -> ProviderResult:
        if capability is Capability.SIMILAR_PAGES:
            return await self._similar(**kwargs)
        if capability is Capability.READ_URL:
            return await self._contents(capability, **kwargs)
        if capability is Capability.READ_MANY:
            return await self._contents_many(**kwargs)
        return await self._search(capability, **kwargs)

    # --- operations --------------------------------------------------------

    async def _search(
        self,
        capability: Capability,
        *,
        query: str,
        limit: int = DEFAULT_RESULTS,
        include_text: bool = True,
        category: str | None = None,
        **_: Any,
    ) -> ProviderResult:
        body: dict[str, Any] = {
            "query": query,
            "numResults": min(max(1, limit), MAX_RESULTS),
        }
        if include_text:
            # Asking for text here is what collapses search-then-fetch into one
            # request; without it every result needs a second round trip.
            body["contents"] = {"text": True}
        if category:
            body["category"] = category

        client = await self.http()
        payload = await client.post_json("/search", json_body=body, operation="search")
        results = _results_from(payload)

        return ProviderResult.success(
            self.name,
            capability,
            data={"query": query, "results": results},
            citations=[_citation(item) for item in results],
        )

    async def _similar(
        self, *, url: str, limit: int = DEFAULT_RESULTS, **_: Any
    ) -> ProviderResult:
        client = await self.http()
        payload = await client.post_json(
            "/findSimilar",
            json_body={
                "url": url,
                "numResults": min(max(1, limit), MAX_RESULTS),
                "contents": {"text": True},
            },
            operation="find_similar",
        )
        results = _results_from(payload)

        return ProviderResult.success(
            self.name,
            Capability.SIMILAR_PAGES,
            data={"url": url, "results": results},
            citations=[_citation(item) for item in results],
        )

    async def _contents(
        self, capability: Capability, *, url: str, **_: Any
    ) -> ProviderResult:
        client = await self.http()
        payload = await client.post_json(
            "/contents",
            json_body={"urls": [url], "text": True},
            operation="contents",
        )
        results = _results_from(payload)

        if not results:
            return ProviderResult.failure(
                self.name,
                capability,
                "Exa returned no content for that URL.",
                error_code="empty_result",
            )

        first = results[0]
        return ProviderResult.success(
            self.name,
            capability,
            data={"url": url, "title": first.get("title"), "text": first.get("text")},
            citations=[_citation(first)],
        )

    async def _contents_many(self, *, urls: list[str], **_: Any) -> ProviderResult:
        """Read several URLs in one request.

        Not a loop over READ_URL. Exa fetches the whole batch server-side and
        bills once, so reading twenty references costs one round trip rather
        than twenty — which is the difference between a research workflow that
        is practical and one that is not.

        A URL that could not be fetched is reported by absence rather than
        silently dropped: `missing` names them, so a caller can tell a page it
        did not get from a page that had nothing to say.
        """
        wanted = [url for url in urls if url][:MAX_RESULTS]
        if not wanted:
            return ProviderResult.failure(
                self.name,
                Capability.READ_MANY,
                "No URLs were given to read.",
                error_code="no_urls",
            )

        client = await self.http()
        payload = await client.post_json(
            "/contents",
            json_body={"urls": wanted, "text": True},
            operation="contents_many",
        )
        results = _results_from(payload)
        returned = {item.get("url") for item in results}

        return ProviderResult.success(
            self.name,
            Capability.READ_MANY,
            data={
                "requested": len(wanted),
                "documents": results,
                "missing": [url for url in wanted if url not in returned],
            },
            citations=[_citation(item) for item in results],
        )


def _results_from(payload: Any) -> list[dict[str, Any]]:
    """Normalise Exa's result list into the shape the report expects."""
    if not isinstance(payload, dict):
        return []

    raw = payload.get("results")
    if not isinstance(raw, list):
        return []

    results: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        results.append(
            {
                "url": item.get("url"),
                "title": item.get("title"),
                "published_at": item.get("publishedDate"),
                "author": item.get("author"),
                "score": item.get("score"),
                "text": item.get("text"),
                "highlights": item.get("highlights") or [],
            }
        )
    return results


def _citation(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "url": item.get("url"),
        "title": item.get("title"),
        "published_at": item.get("published_at"),
        "provider": "exa",
    }
