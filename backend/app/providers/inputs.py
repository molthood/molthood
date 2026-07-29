"""Turning one free-form request into the arguments each capability needs.

The providers do not take a "request"; they take a query, a URL, or a block of
code. Something has to derive those, and doing it here rather than inside each
provider keeps the extraction in one place where it can be read and tested.

Deliberately conservative. Where a value cannot be derived, the field is None
and the orchestrator skips the step with a reason — an invented URL would send
a paid crawl at somebody else's server.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from app.providers.types import Capability

#: A fenced block, with or without a language tag.
_FENCE = re.compile(r"```[a-zA-Z0-9_+-]*\n(.*?)```", re.DOTALL)

#: An explicit URL, or a bare domain with a path.
_URL = re.compile(
    r"https?://[^\s<>\"')]+|(?:[\w-]+\.)+[a-z]{2,}(?:/[^\s<>\"')]*)?", re.IGNORECASE
)

#: Words that look like a domain but are almost always prose. Without this,
#: "compare vue.js and react" would be audited as a website.
_NOT_DOMAINS = frozenset({"vue.js", "next.js", "node.js", "d3.js", "three.js"})

#: Filler that adds nothing to a search query.
_LEADING_NOISE = re.compile(
    r"^(please\s+|can you\s+|could you\s+|i want to\s+|help me\s+)+", re.IGNORECASE
)


@dataclass(frozen=True, slots=True)
class TaskInput:
    """What was extracted from the request."""

    request: str
    query: str
    url: str | None = None
    code: str | None = None

    def arguments_for(self, capability: Capability) -> dict[str, Any] | None:
        """Arguments for one capability, or None when the input is not there.

        Returning None rather than a partial call is the point: a crawl with no
        URL has nothing to crawl, and guessing one would aim a billed request
        at an arbitrary host.
        """
        if capability in (
            Capability.WEB_SEARCH,
            Capability.SEMANTIC_SEARCH,
            Capability.NEWS_SEARCH,
        ):
            return {"query": self.query} if self.query else None

        if capability in (
            Capability.READ_URL,
            Capability.CRAWL_SITE,
            Capability.SCREENSHOT,
            Capability.SIMILAR_PAGES,
        ):
            return {"url": self.url} if self.url else None

        if capability is Capability.RUN_CODE:
            return {"code": self.code} if self.code else None

        if capability is Capability.EXTRACT_STRUCTURED:
            # Needs a schema the caller has not supplied, so it is never run
            # from a free-form request. Reachable directly through the provider.
            return None

        return None


def extract(request: str) -> TaskInput:
    """Pull a query, a URL, and any code out of one request."""
    text = request.strip()

    return TaskInput(
        request=text,
        query=_query_from(text),
        url=_url_from(text),
        code=_code_from(text),
    )


def _url_from(text: str) -> str | None:
    """The first real URL in the text, normalised to an absolute one."""
    for match in _URL.finditer(text):
        candidate = match.group(0).rstrip(".,;:")

        if candidate.lower() in _NOT_DOMAINS:
            continue

        absolute = candidate if "://" in candidate else f"https://{candidate}"
        parsed = urlparse(absolute)

        if not parsed.hostname or "." not in parsed.hostname:
            continue
        # A bare word with a dot is not a host. Requiring a known-shaped TLD
        # keeps "version 1.2" and "file.py" out.
        if len(parsed.hostname.rsplit(".", 1)[-1]) < 2:
            continue

        return absolute

    return None


def _code_from(text: str) -> str | None:
    """A fenced block if there is one; otherwise nothing.

    Only a fence counts. Treating loose prose as code would send whatever
    somebody typed to a Python interpreter, and "calculate the mean of these
    numbers" is a request *about* code, not code.
    """
    match = _FENCE.search(text)
    if match:
        body = match.group(1).strip()
        return body or None
    return None


def _query_from(text: str) -> str:
    """The request as a search query.

    A URL is left in for a repository or site lookup — searching for the URL
    itself is how "what is written about this page" is answered — but the
    conversational filler around it is removed.
    """
    cleaned = _LEADING_NOISE.sub("", text).strip()
    # A fenced block is code, not a query; searching for it would be nonsense.
    cleaned = _FENCE.sub(" ", cleaned).strip()
    return " ".join(cleaned.split())[:400]
