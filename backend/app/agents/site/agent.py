"""Site Agent — off-chain intelligence about a project's public presence."""

from __future__ import annotations

import asyncio
from collections.abc import Coroutine
from dataclasses import asdict, is_dataclass
from typing import Any, ClassVar, Final
from urllib.parse import urlparse

from app.agents.base import AgentMetadata, BaseAgent
from app.engine.context import ExecutionContext
from app.engine.result import AgentResult, Finding
from app.engine.task import Task
from app.logging import get_logger
from app.models.enums import AgentKind
from app.services.web.fetcher import HostVerdict, normalize_url, resolve_host_async
from app.services.web.registry import get_web_registry

logger = get_logger(__name__)

REQUIRED_SERVICES: Final[tuple[str, ...]] = (
    "site_files",
    "dns_over_https",
    "rdap",
    "microlink",
    "wayback",
    "opengraph",
)

#: Per-source ceiling. Each client already bounds itself; this is the backstop
#: that guarantees no single upstream can consume the execution budget, so a
#: partial answer from four sources beats a timeout across all five.
SOURCE_BUDGET_SECONDS: Final = 30.0


def _dump(value: Any) -> Any:
    """Flatten a dataclass into plain JSON-friendly data."""
    return asdict(value) if is_dataclass(value) and not isinstance(value, type) else value


def _as_date(stamp: str | None) -> str | None:
    """Render a Wayback `YYYYMMDDhhmmss` stamp as a readable date.

    Evidence is shown to people, so the raw stamp is kept in `facts` and only
    the date is surfaced.
    """
    if not stamp or len(stamp) < 8 or not stamp[:8].isdigit():
        return None
    return f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]}"


def _why(exc: BaseException) -> str:
    """Phrase a source failure for someone reading the report.

    An unknown finding is only useful if it says what went wrong, so this is
    never allowed to degrade to a bare exception class name for the one case
    that happens most.
    """
    if isinstance(exc, TimeoutError):
        return f"it did not answer within {SOURCE_BUDGET_SECONDS:.0f}s"
    return f"the request failed ({type(exc).__name__})"


async def _bounded[T](source: str, coro: Coroutine[Any, Any, T]) -> T:
    """Run one source under its own deadline.

    Generic so each source keeps its own result type through `asyncio.gather`.

    Raises on expiry so the caller's `gather(return_exceptions=True)` records
    it like any other source failure and drops that section of the evidence.
    """
    try:
        async with asyncio.timeout(SOURCE_BUDGET_SECONDS):
            return await coro
    except TimeoutError:
        logger.warning("site_source_timeout", source=source, budget=SOURCE_BUDGET_SECONDS)
        raise


class SiteAgent(BaseAgent):
    """Reads what a project publishes about itself on the open web.

    Every source is a public endpoint requiring no credential. Slow sources
    (certificate transparency) are gathered opportunistically — the analysis
    completes without them rather than waiting.
    """

    metadata: ClassVar[AgentMetadata] = AgentMetadata(
        kind=AgentKind.SITE,
        name="Site Agent",
        description=(
            "Collects a project's off-chain footprint: published policies, DNS "
            "and mail posture, domain registration, archive history, and "
            "declared metadata."
        ),
        version="0.5.0",
        capabilities=(
            "site_files",
            "dns_posture",
            "domain_registration",
            "archive_history",
            "link_metadata",
        ),
    )

    implemented: ClassVar[bool] = True

    async def _dead_domain(
        self,
        domain: str,
        url: str,
        facts: dict[str, Any],
        context: ExecutionContext,
    ) -> AgentResult:
        """Analyse a domain that has no DNS records.

        This used to be a 422 and the analysis stopped. It is in fact the most
        valuable answer the agent can give — a project naming an official site
        that does not exist — so the two sources that still work are queried
        and the rest are reported as unknown with the reason.

        Registration and archive history need no live host: a domain can be
        registered with no records at all, and the Internet Archive may hold
        captures from when it did resolve.
        """
        registry = get_web_registry()
        facts["resolves"] = False

        for name in ("rdap", "wayback"):
            context.note_service(name)

        registration, archive = await asyncio.gather(
            _bounded("rdap", registry.rdap.lookup(domain)),
            _bounded("wayback", registry.wayback.history(url)),
            return_exceptions=True,
        )

        evidence: list[Finding] = [
            Finding.refuted(
                "resolves",
                "Domain resolves",
                value=False,
                reason=(
                    f"{domain} has no DNS records at all. Nothing is served "
                    "from this address."
                ),
            ),
            Finding.unknown(
                "reachable",
                "Site reachable",
                reason="The domain does not resolve, so there is no host to reach.",
            ),
        ]

        if not isinstance(registration, BaseException) and registration.found:
            facts["registration"] = _dump(registration)
            evidence += [
                Finding.confirmed(
                    "domain_created", "Domain registered", registration.created
                ),
                Finding.confirmed("registrar", "Registrar", registration.registrar),
            ]
            if registration.rdap_server:
                context.add_source("RDAP registry", registration.rdap_server)
        else:
            evidence.append(
                Finding.confirmed(
                    "registration",
                    "Registered in a public registry",
                    False,
                )
            )

        if not isinstance(archive, BaseException):
            facts["archive"] = _dump(archive)
            evidence.append(
                Finding.confirmed(
                    "archived",
                    "Archived by the Wayback Machine",
                    archive.has_snapshot,
                    archive.closest_url,
                )
            )
            if archive.first_capture:
                evidence.append(
                    Finding.confirmed(
                        "first_capture",
                        "First archive capture",
                        _as_date(archive.first_capture),
                    )
                )
            if archive.closest_url:
                context.add_source("Wayback Machine", archive.closest_url)

        context.facts["site"] = facts
        return AgentResult.ok(
            summary=f"{domain} does not resolve.",
            output={"site": facts},
            evidence=evidence,
        )

    async def run(self, task: Task, context: ExecutionContext) -> AgentResult:
        target = (context.routing.address if context.routing else None) or ""
        if not target:
            return AgentResult.failure("Site analysis requires a URL or domain.")

        # Shape is checked here; reachability is a separate question because
        # the answer to it is itself evidence.
        url = normalize_url(target)
        domain = urlparse(url).hostname or ""
        registry = get_web_registry()

        verdict = await resolve_host_async(domain)

        if verdict is HostVerdict.NOT_PUBLIC:
            # A private or loopback host is a caller error, not a subject
            # finding, and the router normally rejects it long before here.
            return AgentResult.failure(f"{domain} does not resolve to a public address.")

        facts: dict[str, Any] = {"url": url, "domain": domain}
        evidence: list[Finding] = []

        if verdict is HostVerdict.UNRESOLVABLE:
            return await self._dead_domain(domain, url, facts, context)

        # Independent sources, issued together. `return_exceptions` keeps one
        # slow or broken source from sinking the whole analysis.
        profile, dns, registration, preview, archive, opengraph = await asyncio.gather(
            _bounded("site_files", registry.site.profile(url)),
            _bounded("dns_over_https", registry.dns.lookup(domain)),
            _bounded("rdap", registry.rdap.lookup(domain)),
            _bounded("microlink", registry.microlink.preview(url)),
            _bounded("wayback", registry.wayback.history(url)),
            _bounded("opengraph", registry.opengraph.preview(url)),
            return_exceptions=True,
        )

        for name in REQUIRED_SERVICES:
            context.note_service(name)

        # --- Published files ---
        if not isinstance(profile, BaseException):
            facts["reachable"] = profile.reachable
            facts["final_url"] = profile.final_url
            facts["metadata"] = _dump(profile.metadata)
            facts["robots"] = _dump(profile.robots)
            facts["security_txt"] = _dump(profile.security)
            facts["sitemap"] = _dump(profile.sitemap)
            facts["feed"] = _dump(profile.feed)
            facts["favicon_url"] = profile.favicon_url
            facts["article_words"] = profile.article.word_count

            evidence += [
                Finding.confirmed(
                    "reachable", "Site reachable", profile.reachable, profile.final_url
                ),
                Finding.confirmed(
                    "title", "Page title", profile.metadata.title, profile.final_url
                ),
                Finding.confirmed(
                    "description",
                    "Meta description",
                    profile.metadata.description,
                    profile.final_url,
                ),
                Finding.confirmed(
                    "robots",
                    "robots.txt present",
                    profile.robots.present,
                    f"{profile.origin}/robots.txt",
                ),
                Finding.confirmed(
                    "security_txt",
                    "security.txt present (RFC 9116)",
                    profile.security.present,
                    f"{profile.origin}/.well-known/security.txt",
                ),
                Finding.confirmed(
                    "sitemap",
                    "Sitemap URLs",
                    profile.sitemap.url_count or None,
                    f"{profile.origin}/sitemap.xml",
                ),
                Finding.confirmed(
                    "feed", "Feed entries", profile.feed.entry_count or None
                ),
                Finding.confirmed(
                    "favicon", "Favicon", profile.favicon_url, profile.favicon_url
                ),
                Finding.confirmed(
                    "content",
                    "Readable article words",
                    profile.article.word_count or None,
                    profile.final_url,
                ),
                Finding.confirmed(
                    "outbound",
                    "Distinct outbound domains",
                    len(profile.metadata.outbound_domains) or None,
                ),
            ]

            if profile.security.contacts:
                evidence.append(
                    Finding.confirmed(
                        "security_contact",
                        "Security contact",
                        ", ".join(profile.security.contacts[:3]),
                    )
                )
            if profile.security.is_expired:
                # The site published a disclosure policy and let it lapse. It
                # made a claim about itself that no longer holds.
                evidence.append(
                    Finding.refuted(
                        "security_expired",
                        "Published security policy is still valid",
                        value=False,
                        reason="The Expires field in security.txt is in the past.",
                        source_url=f"{profile.origin}/.well-known/security.txt",
                    )
                )

            context.add_source("Website", profile.final_url or url)
        else:
            facts["site_error"] = type(profile).__name__
            evidence.append(
                Finding.unknown(
                    "reachable",
                    "Site reachable",
                    reason=f"The site could not be read — {_why(profile)}.",
                    source_url=url,
                )
            )

        # --- DNS ---
        if not isinstance(dns, BaseException):
            facts["dns"] = _dump(dns)
            evidence += [
                Finding.confirmed(
                    "dns_a", "A records", len(dns.records.get("A", [])) or None
                ),
                Finding.confirmed(
                    "dns_mx", "MX records", len(dns.records.get("MX", [])) or None
                ),
                Finding.confirmed(
                    "dns_ns",
                    "Nameservers",
                    ", ".join(dns.records.get("NS", [])[:3]) or None,
                ),
                Finding.confirmed("dnssec", "DNSSEC validated", dns.has_dnssec),
                Finding.confirmed("spf", "SPF policy published", dns.has_spf),
                Finding.confirmed("dmarc", "DMARC policy published", dns.has_dmarc),
                Finding.confirmed(
                    "caa", "CAA records", len(dns.records.get("CAA", [])) or None
                ),
            ]
        else:
            evidence.append(
                Finding.unknown(
                    "dns",
                    "DNS and mail posture",
                    reason=f"The DNS lookup failed — {_why(dns)}.",
                )
            )

        # --- Registration ---
        if isinstance(registration, BaseException):
            evidence.append(
                Finding.unknown(
                    "registration",
                    "Domain registration",
                    reason=f"The RDAP lookup failed — {_why(registration)}.",
                )
            )
        elif not registration.found:
            evidence.append(
                Finding.unknown(
                    "registration",
                    "Domain registration",
                    reason=(
                        "No RDAP registry answered for this TLD, so the domain's "
                        "age and registrar are unavailable."
                    ),
                )
            )
        else:
            facts["registration"] = _dump(registration)
            evidence += [
                Finding.confirmed(
                    "domain_created", "Domain registered", registration.created
                ),
                Finding.confirmed(
                    "domain_expires", "Registration expires", registration.expires
                ),
                Finding.confirmed("registrar", "Registrar", registration.registrar),
                Finding.confirmed(
                    "domain_status",
                    "Domain status",
                    ", ".join(registration.statuses[:3]) or None,
                ),
            ]
            if registration.rdap_server:
                context.add_source("RDAP registry", registration.rdap_server)

        # --- Link preview, read twice by independent extractors ---
        if not isinstance(preview, BaseException):
            facts["preview"] = _dump(preview)
            evidence.append(
                Finding.confirmed("publisher", "Publisher", preview.publisher)
            )

        if not isinstance(opengraph, BaseException) and opengraph.title:
            facts["opengraph"] = _dump(opengraph)
            evidence.append(
                Finding.confirmed("og_title", "Declared OpenGraph title", opengraph.title)
            )

            # Two extractors reading the same page should agree. When they do
            # not, the page is serving different content to different clients.
            other = None if isinstance(preview, BaseException) else preview.title
            if other and other != opengraph.title:
                evidence.append(
                    Finding.refuted(
                        "metadata_mismatch",
                        "Independent extractors agree on the page title",
                        value=f"Microlink: {other} / OpenGraph: {opengraph.title}",
                        reason=(
                            "Two readers of the same URL saw different titles, "
                            "which usually means the page varies by client."
                        ),
                    )
                )
        elif isinstance(opengraph, BaseException) and registry.opengraph.configured:
            evidence.append(
                Finding.unknown(
                    "og_title",
                    "Declared OpenGraph title",
                    reason=f"The OpenGraph read failed — {_why(opengraph)}.",
                )
            )

        # --- Archive ---
        if not isinstance(archive, BaseException):
            facts["archive"] = _dump(archive)
            evidence += [
                Finding.confirmed(
                    "archived",
                    "Archived by the Wayback Machine",
                    archive.has_snapshot,
                    archive.closest_url,
                ),
                Finding.confirmed(
                    "first_capture",
                    "First archive capture",
                    _as_date(archive.first_capture),
                ),
                Finding.confirmed(
                    "last_capture",
                    "Latest archive capture",
                    _as_date(archive.last_capture),
                    archive.closest_url,
                ),
            ]
            if archive.closest_url:
                context.add_source("Wayback Machine", archive.closest_url)
        else:
            evidence.append(
                Finding.unknown(
                    "archived",
                    "Archived by the Wayback Machine",
                    reason=f"The Internet Archive lookup failed — {_why(archive)}.",
                )
            )

        context.facts["site"] = facts
        return AgentResult.ok(
            summary=f"Collected off-chain intelligence for {domain}.",
            output={"site": facts},
            evidence=evidence,
        )


AGENT = SiteAgent
