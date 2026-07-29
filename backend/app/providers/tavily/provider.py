"""Tavily.

Search built for feeding a model rather than a person: results arrive already
trimmed to the relevant passage, with an optional synthesised answer. Its news
mode is the reason it is here — nothing else in this layer orders by recency.

Written against the documented shapes (`POST /search`, `/extract`). Not yet
run against the live API; there is no credential.
"""

from __future__ import annotations

from typing import Any, ClassVar

from app.providers.base import Provider
from app.providers.types import Capability, ProviderResult

DEFAULT_RESULTS = 8
#: Tavily caps a single search here.
MAX_RESULTS = 20


class TavilyProvider(Provider):
    """Answer-shaped web search, news search, and page extraction."""

    name: ClassVar[str] = "tavily"
    title: ClassVar[str] = "Tavily"
    description: ClassVar[str] = (
        "Search trimmed to the relevant passage, with a news mode ordered by "
        "recency and an optional synthesised answer."
    )
    capabilities: ClassVar[tuple[Capability, ...]] = (
        Capability.WEB_SEARCH,
        Capability.NEWS_SEARCH,
        Capability.READ_URL,
    )
    required_env: ClassVar[tuple[str, ...]] = ("TAVILY_API_KEY",)

    async def _probe(self) -> str:
        client = await self.http()
        await client.post_json(
            "/search",
            json_body={
                "query": "molthood health probe",
                "max_results": 1,
                # The cheapest tier Tavily offers, so opening the status page
                # costs as little credit as possible.
                "search_depth": "basic",
            },
            operation="probe",
        )
        return "Search responding."

    async def _perform(self, capability: Capability, /, **kwargs: Any) -> ProviderResult:
        if capability is Capability.READ_URL:
            return await self._extract(**kwargs)
        return await self._search(capability, **kwargs)

    # --- operations --------------------------------------------------------

    async def _search(
        self,
        capability: Capability,
        *,
        query: str,
        limit: int = DEFAULT_RESULTS,
        deep: bool = False,
        include_answer: bool = False,
        **_: Any,
    ) -> ProviderResult:
        body: dict[str, Any] = {
            "query": query,
            "max_results": min(max(1, limit), MAX_RESULTS),
            "search_depth": "advanced" if deep else "basic",
            # `news` reorders toward recency; `general` is relevance-first.
            "topic": "news" if capability is Capability.NEWS_SEARCH else "general",
        }
        if include_answer:
            body["include_answer"] = "basic"

        client = await self.http()
        payload = await client.post_json("/search", json_body=body, operation="search")
        results = _results_from(payload)

        answer = payload.get("answer") if isinstance(payload, dict) else None

        return ProviderResult.success(
            self.name,
            capability,
            data={"query": query, "answer": answer, "results": results},
            citations=[_citation(item) for item in results],
        )

    async def _extract(self, *, url: str, **_: Any) -> ProviderResult:
        client = await self.http()
        payload = await client.post_json(
            "/extract",
            json_body={"urls": [url], "format": "markdown"},
            operation="extract",
        )

        results = payload.get("results") if isinstance(payload, dict) else None
        if not isinstance(results, list) or not results:
            # Tavily reports unreachable pages in a separate list rather than
            # failing the request, so an empty `results` is a real answer about
            # the URL and not a transport problem.
            failed = payload.get("failed_results") if isinstance(payload, dict) else None
            detail = "Tavily could not extract that URL."
            if isinstance(failed, list) and failed:
                first = failed[0]
                if isinstance(first, dict) and first.get("error"):
                    detail = f"Tavily could not extract that URL: {first['error']}"
            return ProviderResult.failure(
                self.name, Capability.READ_URL, detail, error_code="extract_failed"
            )

        first = results[0]
        content = first.get("raw_content") if isinstance(first, dict) else None

        return ProviderResult.success(
            self.name,
            Capability.READ_URL,
            data={"url": url, "text": content},
            citations=[{"url": url, "provider": self.name}],
        )


def _results_from(payload: Any) -> list[dict[str, Any]]:
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
                "text": item.get("content"),
                "score": item.get("score"),
                "published_at": item.get("published_date"),
            }
        )
    return results


def _citation(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "url": item.get("url"),
        "title": item.get("title"),
        "published_at": item.get("published_at"),
        "provider": "tavily",
    }
