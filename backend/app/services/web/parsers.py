"""Content parsers.

These are in-process libraries, not services — nothing here makes a network
call, which is why none of them appears in configuration. Each parser is
defensive: parsing arbitrary third-party content must never raise into an
execution, so failures degrade to an empty result.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from io import BytesIO
from typing import Any
from urllib.parse import urljoin, urlparse

from app.logging import get_logger
from app.services.web.paths import (
    FEED_CONTENT_TYPES,
    FEED_LINK_RELS,
    ICON_LINK_RELS,
)

logger = get_logger(__name__)


# --- HTML -------------------------------------------------------------------


@dataclass(slots=True)
class PageMetadata:
    """What a page says about itself."""

    title: str | None = None
    description: str | None = None
    canonical_url: str | None = None
    language: str | None = None
    generator: str | None = None
    open_graph: dict[str, str] = field(default_factory=dict)
    twitter: dict[str, str] = field(default_factory=dict)
    icon_urls: list[str] = field(default_factory=list)
    feed_urls: list[str] = field(default_factory=list)
    outbound_domains: list[str] = field(default_factory=list)
    heading_count: int = 0
    script_count: int = 0


def _attr(tag: Any, name: str) -> str | None:
    """Read an HTML attribute as a trimmed string.

    BeautifulSoup returns a *list* for multi-valued attributes such as `rel`
    and `class`, so a bare `.strip()` on the result is a latent crash.
    """
    value = tag.get(name)
    if value is None:
        return None
    if isinstance(value, list):
        value = " ".join(str(item) for item in value)
    text = str(value).strip()
    return text or None


def parse_html(html: str, base_url: str) -> PageMetadata:
    """Extract declared metadata, icons, feeds, and outbound domains."""
    from bs4 import BeautifulSoup

    meta = PageMetadata()

    try:
        soup = BeautifulSoup(html, "lxml")
    except Exception as exc:
        logger.warning("html_parse_failed", error=str(exc))
        return meta

    if soup.title and soup.title.string:
        meta.title = soup.title.string.strip()[:300]

    html_tag = soup.find("html")
    if html_tag is not None:
        lang = html_tag.get("lang")
        if isinstance(lang, str):
            meta.language = lang.strip()[:20]

    for tag in soup.find_all("meta"):
        name = (_attr(tag, "name") or _attr(tag, "property") or "").lower()
        content = _attr(tag, "content")
        if not name or content is None:
            continue
        value = content[:500]

        if name == "description":
            meta.description = value
        elif name == "generator":
            meta.generator = value
        elif name.startswith("og:"):
            meta.open_graph[name[3:]] = value
        elif name.startswith("twitter:"):
            meta.twitter[name[8:]] = value

    for link in soup.find_all("link"):
        # `rel` is multi-valued in HTML, so bs4 hands back a list here.
        rel = (_attr(link, "rel") or "").lower()
        href = _attr(link, "href")
        if not href:
            continue
        absolute = urljoin(base_url, href)

        if rel == "canonical":
            meta.canonical_url = absolute
        elif rel in ICON_LINK_RELS:
            if absolute not in meta.icon_urls:
                meta.icon_urls.append(absolute)
        elif rel in FEED_LINK_RELS:
            link_type = (_attr(link, "type") or "").lower()
            if link_type in FEED_CONTENT_TYPES and absolute not in meta.feed_urls:
                meta.feed_urls.append(absolute)

    origin = urlparse(base_url).hostname or ""
    domains: set[str] = set()
    for anchor in soup.find_all("a"):
        href = _attr(anchor, "href")
        if href is None:
            continue
        host = urlparse(urljoin(base_url, href)).hostname
        if host and host != origin:
            domains.add(host.lower())
    meta.outbound_domains = sorted(domains)[:50]

    meta.heading_count = len(soup.find_all(["h1", "h2", "h3"]))
    meta.script_count = len(soup.find_all("script"))

    return meta


# --- Readability ------------------------------------------------------------


@dataclass(slots=True)
class Article:
    title: str | None = None
    text: str = ""
    word_count: int = 0


def extract_article(html: str) -> Article:
    """Pull the main body text out of a page, dropping navigation and ads."""
    try:
        from readability import Document

        document = Document(html)
        summary_html = document.summary()

        from bs4 import BeautifulSoup

        text = BeautifulSoup(summary_html, "lxml").get_text(" ", strip=True)
        return Article(
            title=(document.short_title() or None),
            text=text[:20_000],
            word_count=len(text.split()),
        )
    except Exception as exc:
        logger.warning("readability_failed", error=str(exc))
        return Article()


def html_to_markdown(html: str) -> str:
    """Convert HTML to Markdown — a compact form for an LLM prompt."""
    try:
        from markdownify import markdownify

        return str(markdownify(html, heading_style="ATX"))[:20_000]
    except Exception as exc:
        logger.warning("markdown_conversion_failed", error=str(exc))
        return ""


# --- Feeds ------------------------------------------------------------------


@dataclass(slots=True)
class FeedEntry:
    title: str | None
    link: str | None
    published: str | None


@dataclass(slots=True)
class ParsedFeed:
    title: str | None = None
    entry_count: int = 0
    latest_published: str | None = None
    entries: list[FeedEntry] = field(default_factory=list)


def parse_feed(content: bytes) -> ParsedFeed:
    """Parse RSS, Atom, or JSON Feed."""
    try:
        import feedparser

        parsed = feedparser.parse(content)
        entries = [
            FeedEntry(
                title=(entry.get("title") or None),
                link=(entry.get("link") or None),
                published=(entry.get("published") or entry.get("updated") or None),
            )
            for entry in parsed.entries[:10]
        ]
        return ParsedFeed(
            title=(parsed.feed.get("title") if parsed.feed else None),
            entry_count=len(parsed.entries),
            latest_published=entries[0].published if entries else None,
            entries=entries,
        )
    except Exception as exc:
        logger.warning("feed_parse_failed", error=str(exc))
        return ParsedFeed()


# --- robots.txt -------------------------------------------------------------


@dataclass(slots=True)
class RobotsTxt:
    present: bool = False
    sitemaps: list[str] = field(default_factory=list)
    user_agents: list[str] = field(default_factory=list)
    disallow_count: int = 0
    blocks_all: bool = False


def parse_robots(text: str) -> RobotsTxt:
    """Read the directives we care about — sitemaps and blanket blocks."""
    robots = RobotsTxt(present=True)
    current_agents: list[str] = []

    for raw_line in text.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue

        field_name, _, value = line.partition(":")
        key = field_name.strip().lower()
        value = value.strip()

        if key == "sitemap" and value:
            robots.sitemaps.append(value)
        elif key == "user-agent":
            current_agents = [value.lower()]
            if value not in robots.user_agents:
                robots.user_agents.append(value)
        elif key == "disallow":
            robots.disallow_count += 1
            # "Disallow: /" under "User-agent: *" bars every crawler.
            if value == "/" and "*" in current_agents:
                robots.blocks_all = True

    return robots


# --- security.txt (RFC 9116) ------------------------------------------------


@dataclass(slots=True)
class SecurityTxt:
    present: bool = False
    contacts: list[str] = field(default_factory=list)
    expires: str | None = None
    is_expired: bool | None = None
    policy: str | None = None
    encryption: str | None = None
    preferred_languages: str | None = None


def parse_security_txt(text: str) -> SecurityTxt:
    security = SecurityTxt(present=True)

    for raw_line in text.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue

        field_name, _, value = line.partition(":")
        key = field_name.strip().lower()
        value = value.strip()

        if key == "contact" and value:
            security.contacts.append(value)
        elif key == "expires":
            security.expires = value
            security.is_expired = _is_expired(value)
        elif key == "policy":
            security.policy = value
        elif key == "encryption":
            security.encryption = value
        elif key == "preferred-languages":
            security.preferred_languages = value

    return security


def _is_expired(value: str) -> bool | None:
    """An expired security.txt is a real finding — RFC 9116 requires the field."""
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    from app.utils.time import utcnow

    return parsed < utcnow()


# --- Sitemap ----------------------------------------------------------------


@dataclass(slots=True)
class Sitemap:
    present: bool = False
    is_index: bool = False
    url_count: int = 0
    child_sitemaps: list[str] = field(default_factory=list)
    sample_urls: list[str] = field(default_factory=list)
    latest_modified: str | None = None


def parse_sitemap(content: bytes) -> Sitemap:
    """Parse a urlset or a sitemapindex."""
    sitemap = Sitemap(present=True)

    try:
        from lxml import etree

        # resolve_entities=False blocks XXE — this is third-party XML.
        parser = etree.XMLParser(resolve_entities=False, no_network=True, recover=True)
        root = etree.fromstring(content, parser=parser)
        if root is None:
            return Sitemap()

        tag = etree.QName(root).localname if root.tag else ""
        sitemap.is_index = tag == "sitemapindex"

        modified: list[str] = []
        for element in root:
            locs = [c for c in element if etree.QName(c).localname == "loc"]
            mods = [c for c in element if etree.QName(c).localname == "lastmod"]

            if locs and locs[0].text:
                value = locs[0].text.strip()
                if sitemap.is_index:
                    sitemap.child_sitemaps.append(value)
                else:
                    sitemap.url_count += 1
                    if len(sitemap.sample_urls) < 10:
                        sitemap.sample_urls.append(value)
            if mods and mods[0].text:
                modified.append(mods[0].text.strip())

        if sitemap.is_index:
            sitemap.url_count = len(sitemap.child_sitemaps)
        if modified:
            sitemap.latest_modified = max(modified)

    except Exception as exc:
        logger.warning("sitemap_parse_failed", error=str(exc))
        return Sitemap()

    return sitemap


# --- PDF --------------------------------------------------------------------


@dataclass(slots=True)
class ParsedPDF:
    page_count: int = 0
    text: str = ""
    title: str | None = None
    author: str | None = None


def parse_pdf(content: bytes, *, max_pages: int = 20) -> ParsedPDF:
    """Extract text and document info from a PDF."""
    try:
        from pypdf import PdfReader

        reader = PdfReader(BytesIO(content))
        pages = reader.pages[:max_pages]
        text = "\n".join((page.extract_text() or "") for page in pages)

        info: dict[str, Any] = dict(reader.metadata or {})
        return ParsedPDF(
            page_count=len(reader.pages),
            text=text[:20_000],
            title=_clean(info.get("/Title")),
            author=_clean(info.get("/Author")),
        )
    except Exception as exc:
        logger.warning("pdf_parse_failed", error=str(exc))
        return ParsedPDF()


def _clean(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text[:200] or None
