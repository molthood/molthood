"""Shared transforms over fetched content.

Everything here is a pure function over text or a link list. Nothing calls a
provider, and nothing knows which provider produced its input — which is the
point: a page read by the free reader and a page rendered by the paid one go
through exactly the same normalisation, chunking, and analysis.

Putting these on a provider would have made each one a private feature of
whichever vendor happened to implement it first, and the second vendor would
have grown a second copy. That is the mistake this module exists to avoid.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urljoin, urlparse

#: Roughly four characters per token, which is close enough for budgeting and
#: needs no tokenizer dependency.
CHARS_PER_TOKEN = 4

_HEADING = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
_MD_LINK = re.compile(r"\[([^\]]*)\]\(([^)\s]+)[^)]*\)")
_WHITESPACE = re.compile(r"[ \t]+")
_BLANK_RUN = re.compile(r"\n{3,}")


def normalise(text: str) -> str:
    """Collapse the noise a renderer leaves behind.

    Readers emit runs of blank lines, trailing spaces, and non-breaking spaces
    that survive into every downstream prompt and every stored document. This
    is cheap and idempotent, so it runs on the way in rather than at each use.
    """
    # The non-breaking space is a unicode escape rather than a pasted
    # character: a literal one is indistinguishable from an ordinary space
    # in a diff or a review.
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = cleaned.replace("\u00a0", " ")
    cleaned = _WHITESPACE.sub(" ", cleaned)
    cleaned = "\n".join(line.rstrip() for line in cleaned.split("\n"))
    return _BLANK_RUN.sub("\n\n", cleaned).strip()


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // CHARS_PER_TOKEN)


@dataclass(frozen=True, slots=True)
class Chunk:
    index: int
    text: str
    #: The nearest preceding heading, so a chunk can say where it came from
    #: rather than arriving as an anonymous slice.
    heading: str | None
    tokens: int


def chunk(text: str, *, max_tokens: int = 800, overlap_tokens: int = 60) -> list[Chunk]:
    """Split a document into pieces that fit a context window.

    Split on **headings first, paragraphs second**. Cutting at a fixed
    character count is simpler and produces chunks that begin mid-sentence and
    end mid-table, which is how a summariser ends up confidently describing
    half of something.

    Chunks overlap slightly so a fact spanning a boundary survives in at least
    one of them.
    """
    body = normalise(text)
    if not body:
        return []

    budget = max(1, max_tokens) * CHARS_PER_TOKEN
    overlap = max(0, overlap_tokens) * CHARS_PER_TOKEN

    sections = _split_by_heading(body)
    chunks: list[Chunk] = []

    for heading, section in sections:
        if len(section) <= budget:
            if section.strip():
                chunks.append(_chunk(len(chunks), section, heading))
            continue

        # Too big for one chunk: fall back to paragraphs, packing greedily.
        buffer = ""
        for paragraph in section.split("\n\n"):
            candidate = f"{buffer}\n\n{paragraph}".strip() if buffer else paragraph
            if len(candidate) > budget and buffer:
                chunks.append(_chunk(len(chunks), buffer, heading))
                buffer = (
                    (buffer[-overlap:] + "\n\n" + paragraph) if overlap else paragraph
                )
            else:
                buffer = candidate
        if buffer.strip():
            chunks.append(_chunk(len(chunks), buffer, heading))

    return chunks


def _chunk(index: int, text: str, heading: str | None) -> Chunk:
    body = text.strip()
    return Chunk(index=index, text=body, heading=heading, tokens=estimate_tokens(body))


def _split_by_heading(text: str) -> list[tuple[str | None, str]]:
    matches = list(_HEADING.finditer(text))
    if not matches:
        return [(None, text)]

    sections: list[tuple[str | None, str]] = []
    if matches[0].start() > 0:
        sections.append((None, text[: matches[0].start()]))

    for position, match in enumerate(matches):
        end = matches[position + 1].start() if position + 1 < len(matches) else len(text)
        sections.append((match.group(2).strip(), text[match.start() : end]))

    return sections


def outline(text: str) -> list[dict[str, Any]]:
    """The heading structure of a document, with depth."""
    return [
        {"depth": len(match.group(1)), "title": match.group(2).strip()}
        for match in _HEADING.finditer(normalise(text))
    ]


@dataclass(frozen=True, slots=True)
class LinkGraph:
    internal: tuple[str, ...]
    external: tuple[str, ...]
    #: Hosts linked to, ordered by how often. Says who a page leans on.
    external_hosts: tuple[tuple[str, int], ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "internal": list(self.internal),
            "external": list(self.external),
            "internal_count": len(self.internal),
            "external_count": len(self.external),
            "external_hosts": [
                {"host": host, "links": count} for host, count in self.external_hosts
            ],
        }


def link_graph(markdown: str, *, base_url: str) -> LinkGraph:
    """Split a page's links into internal and external, resolved against a base.

    Relative links are resolved rather than discarded — a documentation page's
    entire navigation is usually relative, and dropping it would report a
    thoroughly interlinked site as having no internal links at all.
    """
    base_host = (urlparse(base_url).hostname or "").lower().removeprefix("www.")

    internal: list[str] = []
    external: list[str] = []
    hosts: dict[str, int] = {}
    seen: set[str] = set()

    for match in _MD_LINK.finditer(markdown):
        raw = match.group(2).strip()
        if not raw or raw.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
            continue

        resolved = urljoin(base_url, raw)
        if resolved in seen:
            continue
        seen.add(resolved)

        host = (urlparse(resolved).hostname or "").lower().removeprefix("www.")
        if not host:
            continue

        if host == base_host:
            internal.append(resolved)
        else:
            external.append(resolved)
            hosts[host] = hosts.get(host, 0) + 1

    ranked = tuple(sorted(hosts.items(), key=lambda item: (-item[1], item[0])))
    return LinkGraph(tuple(internal), tuple(external), ranked)


#: URL path fragments that identify what a page is for. Ordered longest-first
#: so `/api/reference` is classified as reference rather than as api.
_SECTION_HINTS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("documentation", ("/docs", "/documentation", "/guide", "/manual", "/reference")),
    ("pricing", ("/pricing", "/plans", "/billing")),
    ("blog", ("/blog", "/news", "/changelog", "/updates", "/posts")),
    ("legal", ("/terms", "/privacy", "/legal", "/tos", "/dpa")),
    ("support", ("/support", "/help", "/faq", "/contact")),
    ("about", ("/about", "/team", "/careers", "/jobs")),
    ("auth", ("/login", "/signin", "/signup", "/register")),
)


def classify_urls(urls: list[str]) -> dict[str, list[str]]:
    """Group a site's URLs by what each section is for.

    This is what turns a flat list of links into an answer to "does this
    project document itself", "is it priced openly", "has it published
    anything recently" — questions a reader actually has, from a call cheap
    enough to make before deciding to crawl.
    """
    grouped: dict[str, list[str]] = {name: [] for name, _ in _SECTION_HINTS}
    grouped["other"] = []

    for url in urls:
        path = (urlparse(url).path or "/").lower().rstrip("/") or "/"
        for name, hints in _SECTION_HINTS:
            if any(hint in path for hint in hints):
                grouped[name].append(url)
                break
        else:
            grouped["other"].append(url)

    return {name: found for name, found in grouped.items() if found}


def site_shape(urls: list[str]) -> dict[str, Any]:
    """A one-glance description of a site, derived from its URLs alone."""
    sections = classify_urls(urls)
    depths = [
        len([part for part in urlparse(url).path.split("/") if part]) for url in urls
    ]

    return {
        "pages": len(urls),
        "sections": {name: len(found) for name, found in sections.items()},
        "max_depth": max(depths) if depths else 0,
        "has_documentation": "documentation" in sections,
        "has_pricing": "pricing" in sections,
        "has_blog": "blog" in sections,
        "has_legal": "legal" in sections,
    }
