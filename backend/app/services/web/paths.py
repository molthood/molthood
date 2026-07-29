"""Well-known paths and content types.

These are fixed by specification, not by deployment, so they are constants
rather than configuration — making them settable per install would let a
deployment look for `security.txt` somewhere RFC 9116 says it cannot be.
"""

from __future__ import annotations

from typing import Final

#: RFC 9309 — the crawler directives file.
ROBOTS_TXT: Final[str] = "/robots.txt"

#: RFC 9116 — security contact disclosure. The `.well-known` location is
#: canonical; the root path is a legacy fallback still seen in the wild.
SECURITY_TXT: Final[tuple[str, ...]] = (
    "/.well-known/security.txt",
    "/security.txt",
)

#: Conventional sitemap location. Authoritative discovery is the `Sitemap:`
#: directive inside robots.txt, which this is only a fallback for.
SITEMAP_XML: Final[str] = "/sitemap.xml"

#: Last-resort favicon location when the HTML declares no `<link rel="icon">`.
FAVICON_ICO: Final[str] = "/favicon.ico"

#: Common feed locations, tried only after the page's `<link>` tags.
FEED_FALLBACKS: Final[tuple[str, ...]] = (
    "/feed",
    "/rss",
    "/rss.xml",
    "/atom.xml",
    "/feed.xml",
    "/index.xml",
)

#: `<link rel>` values that identify a syndication feed.
FEED_LINK_RELS: Final[frozenset[str]] = frozenset({"alternate"})

FEED_CONTENT_TYPES: Final[frozenset[str]] = frozenset(
    {
        "application/rss+xml",
        "application/atom+xml",
        "application/feed+json",
        "application/json",
    }
)

#: `<link rel>` values that identify a site icon.
ICON_LINK_RELS: Final[frozenset[str]] = frozenset(
    {"icon", "shortcut icon", "apple-touch-icon", "apple-touch-icon-precomposed"}
)

HTML_CONTENT_TYPES: Final[frozenset[str]] = frozenset(
    {"text/html", "application/xhtml+xml"}
)

PDF_CONTENT_TYPE: Final[str] = "application/pdf"
