"""Third-party intelligence APIs.

Each client wraps one official public endpoint. None requires a credential;
GitHub optionally accepts a token purely to raise its rate limit.

All of them share the resilient transport, so retries, timeouts, and error
translation behave the same as for the chain services.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote, urlparse

from pydantic import SecretStr

from app.config import get_settings
from app.logging import get_logger
from app.services.http import ResilientHTTPClient, RetryPolicy, TimeoutPolicy

logger = get_logger(__name__)


# --- Microlink --------------------------------------------------------------


@dataclass(slots=True)
class LinkPreview:
    title: str | None = None
    description: str | None = None
    publisher: str | None = None
    author: str | None = None
    image_url: str | None = None
    logo_url: str | None = None
    lang: str | None = None


class MicrolinkClient:
    """Normalised link metadata. The public tier needs no key."""

    def __init__(self, base_url: str) -> None:
        self._http = ResilientHTTPClient(
            service="microlink",
            base_url=base_url,
            timeout=TimeoutPolicy(connect_seconds=5.0, read_seconds=20.0),
        )

    async def preview(self, url: str) -> LinkPreview:
        payload = await self._http.get_json("/", params={"url": url}, operation="preview")
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, dict):
            return LinkPreview()

        def nested(key: str) -> str | None:
            value = data.get(key)
            if isinstance(value, dict):
                url_value = value.get("url")
                return url_value if isinstance(url_value, str) else None
            return value if isinstance(value, str) else None

        return LinkPreview(
            title=data.get("title"),
            description=data.get("description"),
            publisher=data.get("publisher"),
            author=data.get("author"),
            image_url=nested("image"),
            logo_url=nested("logo"),
            lang=data.get("lang"),
        )

    async def aclose(self) -> None:
        await self._http.aclose()


# --- OpenGraph --------------------------------------------------------------


class OpenGraphClient:
    """opengraph.io — a second, independent reading of a page's own metadata.

    Overlaps Microlink on purpose. Both report what a site declares about
    itself, and when two independent extractors disagree that is itself a
    finding: a page whose declared title differs between readings is usually
    serving different content to different clients.

    Requires a key. Without one, `configured` is False and the site analysis
    simply omits the comparison rather than degrading.
    """

    def __init__(self, base_url: str, api_key: SecretStr | None) -> None:
        self._api_key = api_key
        self._http = ResilientHTTPClient(
            service="opengraph",
            base_url=base_url,
            timeout=TimeoutPolicy(connect_seconds=5.0, read_seconds=20.0),
        )

    @property
    def configured(self) -> bool:
        return self._api_key is not None

    async def preview(self, url: str) -> LinkPreview:
        if self._api_key is None:
            return LinkPreview()

        # The target goes in the path and must be fully percent-encoded —
        # passing it unencoded returns a 404 from their router.
        payload = await self._http.get_json(
            f"/site/{quote(url, safe='')}",
            params={"app_id": self._api_key.get_secret_value()},
            operation="opengraph",
        )
        if not isinstance(payload, dict):
            return LinkPreview()

        # `hybridGraph` merges the declared OpenGraph tags with what they infer
        # from the HTML; `openGraph` alone is what the page actually declares.
        graph = payload.get("hybridGraph") or payload.get("openGraph") or {}
        if not isinstance(graph, dict):
            return LinkPreview()

        image = graph.get("image")
        if isinstance(image, dict):
            image = image.get("url")

        return LinkPreview(
            title=graph.get("title"),
            description=graph.get("description"),
            publisher=graph.get("site_name"),
            image_url=image if isinstance(image, str) else None,
            lang=graph.get("locale"),
        )

    async def aclose(self) -> None:
        await self._http.aclose()


# --- DNS over HTTPS ---------------------------------------------------------

#: Record types worth collecting for a project profile.
DNS_RECORD_TYPES = ("A", "AAAA", "MX", "NS", "TXT", "CAA")


@dataclass(slots=True)
class DNSRecords:
    records: dict[str, list[str]] = field(default_factory=dict)
    has_dnssec: bool = False
    has_spf: bool = False
    has_dmarc: bool = False


class DoHClient:
    """DNS over HTTPS against the resolver operator's own endpoint."""

    def __init__(self, base_url: str) -> None:
        parsed = urlparse(base_url)
        self._path = parsed.path or "/dns-query"
        self._http = ResilientHTTPClient(
            service="dns",
            base_url=f"{parsed.scheme}://{parsed.netloc}",
            # Cloudflare requires this; Google's /resolve ignores it.
            headers={"accept": "application/dns-json"},
            timeout=TimeoutPolicy(connect_seconds=4.0, read_seconds=8.0),
        )

    async def _query(self, name: str, record_type: str) -> dict[str, Any]:
        payload = await self._http.get_json(
            self._path,
            params={"name": name, "type": record_type},
            operation=f"dns:{record_type}",
        )
        return payload if isinstance(payload, dict) else {}

    async def lookup(self, domain: str) -> DNSRecords:
        import asyncio

        results = await asyncio.gather(
            *(self._query(domain, kind) for kind in DNS_RECORD_TYPES),
            self._query(f"_dmarc.{domain}", "TXT"),
            return_exceptions=True,
        )

        records = DNSRecords()

        for kind, payload in zip(DNS_RECORD_TYPES, results, strict=False):
            if isinstance(payload, BaseException) or not payload:
                continue
            answers = payload.get("Answer") or []
            values = [
                str(answer.get("data", "")).strip('"')
                for answer in answers
                if isinstance(answer, dict) and answer.get("data")
            ]
            if values:
                records.records[kind] = values[:10]
            # AD = "authenticated data": the resolver validated DNSSEC.
            if payload.get("AD"):
                records.has_dnssec = True

        records.has_spf = any(
            value.lower().startswith("v=spf1") for value in records.records.get("TXT", [])
        )

        dmarc = results[-1]
        if not isinstance(dmarc, BaseException) and isinstance(dmarc, dict):
            answers = dmarc.get("Answer") or []
            records.has_dmarc = any(
                "v=dmarc1" in str(answer.get("data", "")).lower()
                for answer in answers
                if isinstance(answer, dict)
            )

        return records

    async def aclose(self) -> None:
        await self._http.aclose()


# --- RDAP -------------------------------------------------------------------


@dataclass(slots=True)
class DomainRegistration:
    found: bool = False
    domain: str | None = None
    registrar: str | None = None
    created: str | None = None
    expires: str | None = None
    updated: str | None = None
    statuses: list[str] = field(default_factory=list)
    nameservers: list[str] = field(default_factory=list)
    rdap_server: str | None = None


class RDAPClient:
    """Registration data, resolved through IANA's bootstrap registry.

    The bootstrap maps each TLD to its authoritative RDAP server, so a lookup
    reaches the registry directly (Verisign for .com, and so on) rather than a
    third-party redirector.
    """

    def __init__(self, bootstrap_url: str) -> None:
        self._bootstrap_url = bootstrap_url
        self._http = ResilientHTTPClient(
            service="rdap",
            timeout=TimeoutPolicy(connect_seconds=5.0, read_seconds=15.0),
        )
        self._tld_map: dict[str, str] | None = None

    async def _bootstrap(self) -> dict[str, str]:
        if self._tld_map is not None:
            return self._tld_map

        payload = await self._http.get_json(
            self._bootstrap_url, operation="rdap_bootstrap"
        )
        mapping: dict[str, str] = {}

        services = payload.get("services") if isinstance(payload, dict) else None
        for entry in services or []:
            if not isinstance(entry, list) or len(entry) != 2:
                continue
            tlds, servers = entry
            if not servers:
                continue
            for tld in tlds:
                mapping[str(tld).lower()] = str(servers[0]).rstrip("/")

        self._tld_map = mapping
        logger.info("rdap_bootstrap_loaded", tlds=len(mapping))
        return mapping

    async def lookup(self, domain: str) -> DomainRegistration:
        name = domain.strip().lower().rstrip(".")
        tld = name.rsplit(".", 1)[-1] if "." in name else ""

        mapping = await self._bootstrap()
        server = mapping.get(tld)
        if server is None:
            return DomainRegistration(found=False, domain=name)

        payload = await self._http.get_json(
            f"{server}/domain/{quote(name)}", operation="rdap_domain"
        )
        if not isinstance(payload, dict):
            return DomainRegistration(found=False, domain=name, rdap_server=server)

        registration = DomainRegistration(
            found=True,
            domain=payload.get("ldhName") or name,
            statuses=[str(s) for s in (payload.get("status") or [])][:10],
            rdap_server=server,
        )

        for event in payload.get("events") or []:
            if not isinstance(event, dict):
                continue
            action = str(event.get("eventAction", "")).lower()
            date = event.get("eventDate")
            if action == "registration":
                registration.created = date
            elif action == "expiration":
                registration.expires = date
            elif action in {"last changed", "last update of rdap database"}:
                registration.updated = date

        for entity in payload.get("entities") or []:
            if not isinstance(entity, dict):
                continue
            if "registrar" in [str(r).lower() for r in (entity.get("roles") or [])]:
                registration.registrar = _vcard_name(entity) or entity.get("handle")
                break

        registration.nameservers = [
            str(ns.get("ldhName"))
            for ns in (payload.get("nameservers") or [])
            if isinstance(ns, dict) and ns.get("ldhName")
        ][:10]

        return registration

    async def aclose(self) -> None:
        await self._http.aclose()


def _vcard_name(entity: dict[str, Any]) -> str | None:
    """Pull the display name out of an RDAP jCard array."""
    vcard = entity.get("vcardArray")
    if not isinstance(vcard, list) or len(vcard) < 2:
        return None
    for item in vcard[1]:
        if isinstance(item, list) and len(item) >= 4 and item[0] == "fn":
            return str(item[3])
    return None


# --- Certificate transparency ----------------------------------------------


@dataclass(slots=True)
class CertificateHistory:
    total: int = 0
    unique_names: list[str] = field(default_factory=list)
    issuers: list[str] = field(default_factory=list)
    earliest: str | None = None
    latest: str | None = None


class CrtShClient:
    """Certificate transparency search.

    crt.sh routinely takes 30 seconds or more for one domain, so it gets a
    dedicated timeout and only one attempt — retrying a 30s call would blow any
    reasonable execution budget.
    """

    def __init__(self, base_url: str, timeout_seconds: float) -> None:
        self._http = ResilientHTTPClient(
            service="crtsh",
            base_url=base_url,
            retry=RetryPolicy(max_attempts=1),
            timeout=TimeoutPolicy(connect_seconds=10.0, read_seconds=timeout_seconds),
        )

    async def history(self, domain: str) -> CertificateHistory:
        payload = await self._http.get_json(
            "/", params={"q": domain, "output": "json"}, operation="crtsh"
        )
        if not isinstance(payload, list):
            return CertificateHistory()

        names: set[str] = set()
        issuers: set[str] = set()
        dates: list[str] = []

        for entry in payload:
            if not isinstance(entry, dict):
                continue
            for value in str(entry.get("name_value", "")).splitlines():
                cleaned = value.strip().lower()
                if cleaned:
                    names.add(cleaned)
            issuer = entry.get("issuer_name")
            if issuer:
                issuers.add(str(issuer)[:120])
            entry_date = entry.get("not_before")
            if entry_date:
                dates.append(str(entry_date))

        return CertificateHistory(
            total=len(payload),
            unique_names=sorted(names)[:50],
            issuers=sorted(issuers)[:10],
            earliest=min(dates) if dates else None,
            latest=max(dates) if dates else None,
        )

    async def aclose(self) -> None:
        await self._http.aclose()


# --- Wayback Machine --------------------------------------------------------


@dataclass(slots=True)
class ArchiveHistory:
    has_snapshot: bool = False
    closest_url: str | None = None
    closest_timestamp: str | None = None
    #: Wayback stamps, `YYYYMMDDhhmmss`.
    first_capture: str | None = None
    last_capture: str | None = None


#: A date before the Internet Archive existed (it began in 1996). Asking
#: availability for the snapshot *closest* to this returns the earliest one
#: there is, because every capture is later — so this is an exact first
#: capture, not an approximation.
_BEFORE_THE_ARCHIVE = "19950101"

#: Ceiling on the capture index, which is not on the interactive path but is
#: still bounded for any caller that asks for it.
CDX_BUDGET_SECONDS = 20.0


class WaybackClient:
    """Internet Archive history.

    Built entirely on the availability API. The obvious source for archival
    history is the CDX index, and it was the first implementation, but it is
    not viable interactively: measured against three real domains it ran
    5 to 60 seconds with no pattern, and `fastLatest` (the documented speed-up)
    cut robinhood.com from 28s to 7s while pushing github.com past 90s. Its
    read timeout never fires either, because CDX answers as a slow drip rather
    than stalling, so httpx keeps resetting the clock.

    Two availability calls give the same first and last capture in about a
    second, verified exact against the CDX index for robinhood.com,
    github.com, and cloudflare.com. The capture *count* is the one fact only
    CDX has; `capture_index` remains available for callers that can afford to
    wait, and is deliberately not part of `history`.
    """

    def __init__(self, availability_url: str, cdx_url: str) -> None:
        self._availability_url = availability_url
        self._cdx_url = cdx_url
        self._http = ResilientHTTPClient(
            service="wayback",
            timeout=TimeoutPolicy(connect_seconds=5.0, read_seconds=25.0),
        )

    async def _closest(self, url: str, timestamp: str | None = None) -> dict[str, Any]:
        """The archived snapshot nearest a date, or the most recent one."""
        params: dict[str, Any] = {"url": url}
        if timestamp is not None:
            params["timestamp"] = timestamp

        payload = await self._http.get_json(
            self._availability_url, params=params, operation="wayback_available"
        )
        if not isinstance(payload, dict):
            return {}

        snapshots = payload.get("archived_snapshots") or {}
        closest = snapshots.get("closest") if isinstance(snapshots, dict) else None
        return closest if isinstance(closest, dict) and closest.get("available") else {}

    async def history(self, url: str) -> ArchiveHistory:
        latest: Any
        earliest: Any
        latest, earliest = await asyncio.gather(
            self._closest(url),
            self._closest(url, _BEFORE_THE_ARCHIVE),
            return_exceptions=True,
        )

        history = ArchiveHistory()

        if isinstance(latest, dict) and latest:
            history.has_snapshot = True
            history.closest_url = latest.get("url")
            history.closest_timestamp = latest.get("timestamp")
            history.last_capture = latest.get("timestamp")

        if isinstance(earliest, dict) and earliest:
            history.has_snapshot = True
            history.first_capture = earliest.get("timestamp")

        return history

    async def capture_index(self, url: str) -> list[str]:
        """Every capture timestamp, collapsed to one per month.

        Slow and highly variable — see the class docstring. Not called during
        a site analysis.
        """
        async with asyncio.timeout(CDX_BUDGET_SECONDS):
            payload = await self._http.get_json(
                self._cdx_url,
                params={
                    "url": url,
                    "output": "json",
                    "fl": "timestamp",
                    "collapse": "timestamp:6",
                    "limit": 2000,
                },
                operation="wayback_cdx",
            )

        if not isinstance(payload, list) or len(payload) < 2:
            return []
        # Row 0 is the header; the rest are single-column timestamps.
        return [str(row[0]) for row in payload[1:] if row]

    async def aclose(self) -> None:
        await self._http.aclose()


# --- GitHub -----------------------------------------------------------------


@dataclass(slots=True)
class Repository:
    found: bool = False
    full_name: str | None = None
    description: str | None = None
    stars: int = 0
    forks: int = 0
    open_issues: int = 0
    language: str | None = None
    license_name: str | None = None
    created_at: str | None = None
    pushed_at: str | None = None
    archived: bool = False
    topics: list[str] = field(default_factory=list)
    has_readme: bool = False


class GitHubClient:
    """Repository metadata and raw file access.

    Works anonymously; a token only raises the rate limit from 60 to 5000
    requests an hour.
    """

    def __init__(
        self, api_base_url: str, raw_base_url: str, token: SecretStr | None = None
    ) -> None:
        headers = {"accept": "application/vnd.github+json"}
        if token is not None:
            headers["authorization"] = f"Bearer {token.get_secret_value()}"

        self._api = ResilientHTTPClient(
            service="github", base_url=api_base_url, headers=headers
        )
        self._raw = ResilientHTTPClient(service="github_raw", base_url=raw_base_url)
        self.has_token = token is not None

    async def repository(self, owner: str, repo: str) -> Repository:
        payload = await self._api.get_json(
            f"/repos/{quote(owner)}/{quote(repo)}", operation="repo"
        )
        if not isinstance(payload, dict):
            return Repository()

        licence = payload.get("license")
        readme = await self.raw_file(owner, repo, "README.md")

        return Repository(
            found=True,
            full_name=payload.get("full_name"),
            description=payload.get("description"),
            stars=int(payload.get("stargazers_count") or 0),
            forks=int(payload.get("forks_count") or 0),
            open_issues=int(payload.get("open_issues_count") or 0),
            language=payload.get("language"),
            license_name=(licence or {}).get("name")
            if isinstance(licence, dict)
            else None,
            created_at=payload.get("created_at"),
            pushed_at=payload.get("pushed_at"),
            archived=bool(payload.get("archived")),
            topics=[str(t) for t in (payload.get("topics") or [])][:15],
            has_readme=readme is not None,
        )

    async def raw_file(
        self, owner: str, repo: str, path: str, ref: str = "HEAD"
    ) -> str | None:
        """Read a file straight from raw.githubusercontent.com."""
        try:
            body = await self._raw.request(
                "GET",
                f"/{quote(owner)}/{quote(repo)}/{quote(ref)}/{path}",
                operation="raw_file",
            )
        except Exception:
            return None
        return body if isinstance(body, str) else None

    async def rate_limit(self) -> dict[str, Any]:
        payload = await self._api.get_json("/rate_limit", operation="rate_limit")
        rate = payload.get("rate") if isinstance(payload, dict) else None
        return rate if isinstance(rate, dict) else {}

    async def aclose(self) -> None:
        await self._api.aclose()
        await self._raw.aclose()


def build_github_client() -> GitHubClient:
    settings = get_settings()
    return GitHubClient(
        settings.github_api_base_url,
        settings.github_raw_base_url,
        settings.github_token,
    )
