"""Web intelligence — off-chain signals about a project's public presence.

Complements the chain services: `app.services.rpc` and `app.services.blockscout`
answer "what is this contract", these answer "who is behind it and what have
they published".

Nothing here requires a credential.
"""

from app.services.web.fetcher import (
    FetchedResource,
    WebFetcher,
    validate_public_url,
    web_fetcher,
)
from app.services.web.intel import (
    CrtShClient,
    DoHClient,
    GitHubClient,
    MicrolinkClient,
    RDAPClient,
    WaybackClient,
)
from app.services.web.registry import WebIntelRegistry, get_web_registry
from app.services.web.site import SiteClient, SiteProfile

__all__ = [
    "CrtShClient",
    "DoHClient",
    "FetchedResource",
    "GitHubClient",
    "MicrolinkClient",
    "RDAPClient",
    "SiteClient",
    "SiteProfile",
    "WaybackClient",
    "WebFetcher",
    "WebIntelRegistry",
    "get_web_registry",
    "validate_public_url",
    "web_fetcher",
]
