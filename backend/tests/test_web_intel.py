"""Web intelligence: SSRF defence, parsers, and routing.

The SSRF tests matter most — this is the only layer that fetches a URL the
caller chose, so a gap there is a server-side request forgery hole.
"""

from __future__ import annotations

import pytest

from app.agents.site.agent import _as_date
from app.core.exceptions import ValidationError
from app.engine.context import ExecutionRequest
from app.engine.router import AnalysisTarget, ExecutionRouter
from app.models.enums import AgentKind
from app.services.web.fetcher import validate_public_url
from app.services.web.intel import WaybackClient
from app.services.web.parsers import (
    parse_feed,
    parse_html,
    parse_robots,
    parse_security_txt,
    parse_sitemap,
)
from app.utils.validation import extract_url

# --- SSRF defence -----------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "http://localhost/admin",
        "https://169.254.169.254/latest/meta-data/",  # cloud metadata
        "http://10.0.0.5/",
        "http://192.168.1.1/",
        "http://172.16.0.1/",
        "http://[::1]/",
        "http://0.0.0.0/",
    ],
)
def test_private_and_loopback_addresses_are_refused(url: str) -> None:
    with pytest.raises(ValidationError):
        validate_public_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "gopher://example.com/",
        "ftp://example.com/",
        "data:text/html,<script>alert(1)</script>",
    ],
)
def test_non_http_schemes_are_refused(url: str) -> None:
    with pytest.raises(ValidationError):
        validate_public_url(url)


def test_empty_url_is_refused() -> None:
    with pytest.raises(ValidationError):
        validate_public_url("")


def test_bare_domain_is_upgraded_to_https() -> None:
    assert validate_public_url("example.com").startswith("https://example.com")


def test_public_url_passes() -> None:
    assert validate_public_url("https://example.com/path") == "https://example.com/path"


def test_rejection_carries_an_actionable_message() -> None:
    with pytest.raises(ValidationError) as excinfo:
        validate_public_url("http://127.0.0.1/")

    assert excinfo.value.status_code == 422
    assert excinfo.value.suggested_action


# --- URL extraction ---------------------------------------------------------


def test_extract_url_finds_a_domain() -> None:
    assert extract_url("have a look at molthood.xyz please") == "molthood.xyz"


def test_extract_url_ignores_an_address() -> None:
    """A contract address must never be mistaken for a website."""
    text = "analyze 0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34"
    assert extract_url(text) is None


def test_extract_url_ignores_version_numbers() -> None:
    assert extract_url("compiler v0.8.26 was used") is None


def test_extract_url_keeps_the_path() -> None:
    assert extract_url("see https://example.com/a/b") == "https://example.com/a/b"


@pytest.mark.parametrize(
    "text,expected",
    [
        ("analyze http://127.0.0.1/", "http://127.0.0.1/"),
        ("fetch http://169.254.169.254/latest/", "http://169.254.169.254/latest/"),
        ("try http://[::1]/admin", "http://[::1]/admin"),
    ],
)
def test_extract_url_finds_scheme_qualified_address_literals(
    text: str, expected: str
) -> None:
    """These must be *matched* so the SSRF guard is what rejects them.

    Skipping them made routing fail earlier with "a site analysis needs a URL",
    which told the caller nothing about why the host was refused.
    """
    assert extract_url(text) == expected


def test_extract_url_ignores_a_bare_dotted_quad() -> None:
    """Without a scheme this is indistinguishable from a version number."""
    assert extract_url("upgraded to 10.0.0.5 last week") is None


# --- Routing ----------------------------------------------------------------


async def test_router_rejects_a_private_host(fake_services) -> None:
    """The SSRF guard runs during routing, so this is a 422, not a failed run."""
    router = ExecutionRouter(services=fake_services)

    with pytest.raises(ValidationError):
        await router.route(ExecutionRequest(request="analyze the site http://127.0.0.1/"))


async def test_explicit_site_target_is_not_a_way_past_the_guard(fake_services) -> None:
    """`metadata.target` skips keyword routing; it must not skip validation."""
    router = ExecutionRouter(services=fake_services)

    with pytest.raises(ValidationError):
        await router.route(
            ExecutionRequest(
                request="analyze this",
                metadata={"target": "site", "address": "http://169.254.169.254/"},
            )
        )


async def test_router_sends_a_url_to_the_site_agent(fake_services) -> None:
    router = ExecutionRouter(services=fake_services)
    decision = await router.route(ExecutionRequest(request="look at molthood.xyz"))

    assert decision.target is AnalysisTarget.SITE
    assert decision.primary_agent is AgentKind.SITE


async def test_site_analysis_skips_the_risk_agent(fake_services) -> None:
    """Risk scores on-chain evidence; a website has none to score."""
    router = ExecutionRouter(services=fake_services)
    decision = await router.route(ExecutionRequest(request="check the site example.com"))

    assert AgentKind.RISK not in decision.agents


async def test_address_still_wins_over_a_url(fake_services) -> None:
    router = ExecutionRouter(services=fake_services)
    decision = await router.route(
        ExecutionRequest(
            request="audit contract 0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34"
        )
    )

    assert decision.target is AnalysisTarget.CONTRACT


# --- Parsers ----------------------------------------------------------------


def test_parse_robots_reads_sitemaps_and_blanket_block() -> None:
    robots = parse_robots(
        "User-agent: *\nDisallow: /\nSitemap: https://example.com/sitemap.xml\n"
    )

    assert robots.present
    assert robots.blocks_all
    assert robots.sitemaps == ["https://example.com/sitemap.xml"]


def test_parse_robots_ignores_comments() -> None:
    robots = parse_robots("# Sitemap: https://fake/sitemap.xml\nUser-agent: *\n")

    assert robots.sitemaps == []
    assert not robots.blocks_all


def test_parse_security_txt_detects_expiry() -> None:
    security = parse_security_txt(
        "Contact: mailto:security@example.com\nExpires: 2020-01-01T00:00:00Z\n"
    )

    assert security.contacts == ["mailto:security@example.com"]
    assert security.is_expired is True


def test_parse_security_txt_future_expiry_is_not_expired() -> None:
    security = parse_security_txt("Expires: 2099-01-01T00:00:00Z\n")

    assert security.is_expired is False


def test_parse_html_extracts_metadata_icons_and_feeds() -> None:
    html = """
    <html lang="en"><head>
      <title>Molthood</title>
      <meta name="description" content="Execution agents">
      <meta property="og:title" content="Molthood OG">
      <link rel="canonical" href="/home">
      <link rel="icon" href="/icon.png">
      <link rel="alternate" type="application/rss+xml" href="/feed.xml">
    </head><body>
      <h1>Hi</h1><a href="https://other.test/x">out</a>
    </body></html>
    """
    meta = parse_html(html, "https://example.com/")

    assert meta.title == "Molthood"
    assert meta.description == "Execution agents"
    assert meta.open_graph["title"] == "Molthood OG"
    assert meta.canonical_url == "https://example.com/home"
    assert meta.icon_urls == ["https://example.com/icon.png"]
    assert meta.feed_urls == ["https://example.com/feed.xml"]
    assert meta.outbound_domains == ["other.test"]


def test_parse_html_survives_malformed_markup() -> None:
    """Third-party HTML is arbitrary; parsing must never raise."""
    meta = parse_html("<html><head><title>Broken", "https://example.com/")

    assert meta.title is not None


def test_parse_sitemap_counts_urls() -> None:
    xml = b"""<?xml version="1.0"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/a</loc><lastmod>2026-01-01</lastmod></url>
      <url><loc>https://example.com/b</loc></url>
    </urlset>"""
    sitemap = parse_sitemap(xml)

    assert sitemap.present
    assert sitemap.url_count == 2
    assert not sitemap.is_index


def test_parse_sitemap_detects_an_index() -> None:
    xml = b"""<?xml version="1.0"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/s1.xml</loc></sitemap>
    </sitemapindex>"""
    sitemap = parse_sitemap(xml)

    assert sitemap.is_index
    assert sitemap.child_sitemaps == ["https://example.com/s1.xml"]


def test_parse_sitemap_does_not_resolve_external_entities() -> None:
    """XXE guard — third-party XML must not read local files."""
    xxe = b"""<?xml version="1.0"?>
    <!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>&xxe;</loc></url>
    </urlset>"""
    sitemap = parse_sitemap(xxe)

    assert "root:" not in " ".join(sitemap.sample_urls)


def test_parse_feed_reads_entries() -> None:
    rss = b"""<?xml version="1.0"?>
    <rss version="2.0"><channel>
      <title>Blog</title>
      <item><title>Post A</title><link>https://example.com/a</link></item>
      <item><title>Post B</title><link>https://example.com/b</link></item>
    </channel></rss>"""
    feed = parse_feed(rss)

    assert feed.title == "Blog"
    assert feed.entry_count == 2


def test_parse_feed_survives_garbage() -> None:
    assert parse_feed(b"not a feed at all").entry_count == 0


# --- Wayback degradation ----------------------------------------------------


def _snapshot(timestamp: str) -> dict[str, object]:
    return {
        "archived_snapshots": {
            "closest": {
                "available": True,
                "url": f"http://web.archive.org/web/{timestamp}/https://example.com",
                "timestamp": timestamp,
            }
        }
    }


async def test_wayback_reads_first_and_last_capture_without_the_index(
    monkeypatch,
) -> None:
    """The first capture comes from a date before the archive existed.

    Every snapshot is later than 1995, so the *closest* one to that date is
    the earliest one — exact, and a second rather than the CDX index's 30.
    """
    client = WaybackClient("https://archive.org/wayback/available", "https://cdx/")
    seen: list[str | None] = []

    async def available(url: str, **kwargs: object) -> dict[str, object]:
        params = kwargs.get("params")
        stamp = params.get("timestamp") if isinstance(params, dict) else None
        seen.append(stamp)
        return _snapshot("19990508140246" if stamp else "20260725053504")

    monkeypatch.setattr(client._http, "get_json", available)
    history = await client.history("https://example.com")

    assert history.has_snapshot
    assert history.first_capture == "19990508140246"
    assert history.last_capture == "20260725053504"
    assert "19950101" in seen, "the earliest-capture query must predate the archive"


async def test_wayback_survives_one_failed_availability_call(monkeypatch) -> None:
    """The two queries are independent, so a half-answer is still useful."""
    client = WaybackClient("https://archive.org/wayback/available", "https://cdx/")

    async def half_broken(url: str, **kwargs: object) -> dict[str, object]:
        params = kwargs.get("params")
        if isinstance(params, dict) and params.get("timestamp"):
            raise TimeoutError
        return _snapshot("20260725053504")

    monkeypatch.setattr(client._http, "get_json", half_broken)
    history = await client.history("https://example.com")

    assert history.has_snapshot
    assert history.last_capture == "20260725053504"
    assert history.first_capture is None


def test_wayback_stamps_are_rendered_as_dates() -> None:
    """Evidence is read by people; the raw stamp stays in `facts`."""
    assert _as_date("20080514210148") == "2008-05-14"
    assert _as_date(None) is None
    assert _as_date("nonsense") is None


# --- Registry ---------------------------------------------------------------


def test_web_registry_reports_capabilities_without_network() -> None:
    from app.services.web.registry import get_web_registry

    capabilities = get_web_registry().describe()
    names = {capability["name"] for capability in capabilities}

    assert names == {
        "microlink",
        "opengraph",
        "dns_over_https",
        "rdap",
        "crtsh",
        "wayback",
        "github",
        "goplus",
        "openchain",
        "site_files",
    }

    # OpenGraph is the only credentialed source, and it only corroborates
    # Microlink. A site analysis must stay complete with no credential at all,
    # so every other source has to be keyless.
    keyed = {c["name"] for c in capabilities if c["requires_key"]}
    assert keyed == {"opengraph"}
