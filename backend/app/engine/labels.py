"""Naming a source by what it did, not by which company it was.

The console has done this for a while, rewriting labels on the way to the
screen. That was a patch over the real problem: the **backend emits vendor
names**, so anyone reading the API directly sees them, the markdown artifact
prints them, and — the case that actually shipped — the summariser reads them
in the facts it is given and repeats them in its prose:

    "$1.00001643726 via Codex"

A client-side rewrite cannot reach that. The model saw the word because the
word was in its input, so the fix has to happen before the prompt is built.

The one thing deliberately *not* renamed is the chain node: "RPC" names a
protocol rather than a company, and calling it something vaguer would lose
real meaning.
"""

from __future__ import annotations

import re
from typing import Any

#: Internal service name → the role it plays.
SERVICE_ROLES: dict[str, str] = {
    "blockscout": "Chain explorer",
    "robinhood_rpc": "Chain node",
    "codex": "Market data",
    "goplus": "Security screening",
    "openchain": "Contract signatures",
    "openrouter": "Summary generation",
    "exa": "Source discovery",
    "tavily": "Source discovery",
    "firecrawl": "Page retrieval",
    "jina": "Page retrieval",
    "e2b": "Code execution",
    "upstash_redis": "Caching",
    "upstash_qstash": "Scheduling",
    "posthog": "Product analytics",
    "microlink": "Page metadata",
    "opengraph": "Page metadata",
    "wayback": "Archive history",
    "crtsh": "Certificate records",
    "rdap": "Domain registration",
}

#: Fragments that identify a supplier inside a human-written label. Ordered
#: longest-first so "GoPlus token security" is rewritten whole rather than
#: having a shorter match take a bite out of it.
_PHRASES: tuple[tuple[re.Pattern[str], str], ...] = tuple(
    (re.compile(pattern, re.IGNORECASE), replacement)
    for pattern, replacement in (
        (r"blockscout (token|address|contract) (page|api)", "Chain explorer"),
        (r"blockscout (stats )?api", "Chain explorer"),
        (r"blockscout explorer", "Chain explorer"),
        (r"blockscout", "Chain explorer"),
        (r"goplus token security", "Security screening"),
        (r"goplus", "Security screening"),
        (r"codex market data", "Market data"),
        (r"codex", "Market data"),
        (r"openrouter", "Summary generation"),
        (r"openchain", "Contract signatures"),
        (r"\bexa\b", "Source discovery"),
        (r"\btavily\b", "Source discovery"),
        (r"firecrawl", "Page retrieval"),
        (r"jina( reader)?", "Page retrieval"),
        (r"\be2b\b", "Code execution"),
        (r"microlink", "Page metadata"),
    )
)

_DOUBLED = re.compile(r"\b(\w[\w\s]*?)\s+\1\b", re.IGNORECASE)

#: A URL, wherever it appears. Matched so it can be **protected** rather than
#: rewritten — a hostname is an address, not prose.
_URL = re.compile(r"""https?://[^\s)\]"']+""", re.IGNORECASE)


def describe_source(text: str) -> str:
    """Supplier names removed, and any links left exactly as they were.

    URLs are lifted out before substitution and restored afterwards. Without
    that step a value carrying its own link had the hostname rewritten —
    `https://robinhoodchain.blockscout.com/…` became
    `https://robinhoodchain.Chain explorer.com/…`, a link that no longer
    resolves. That trades the one real guarantee a finding has for a cosmetic
    one, which is the trade this module is not allowed to make.
    """
    protected: list[str] = []

    def stash(match: re.Match[str]) -> str:
        protected.append(match.group(0))
        return f"\x00{len(protected) - 1}\x00"

    result = _URL.sub(stash, text)
    for pattern, role in _PHRASES:
        result = pattern.sub(role, result)
    # Collapse anything the substitutions doubled, e.g. "Chain explorer Chain
    # explorer API".
    result = _DOUBLED.sub(r"\1", result)

    for index, url in enumerate(protected):
        result = result.replace(f"\x00{index}\x00", url)

    return result.strip()


def describe_service(name: str) -> str:
    return SERVICE_ROLES.get(name, "Data source")


def _rename_key(key: str) -> str:
    """Rewrite a vendor name inside a fact key.

    Keys are snake_case identifiers rather than prose, so the role is applied
    in the same shape: `deployer_share_goplus_pct` becomes
    `deployer_share_screened_pct` rather than acquiring a capitalised phrase
    in the middle of an identifier.
    """
    renamed = key
    for vendor, replacement in (
        ("blockscout", "explorer"),
        ("goplus", "screened"),
        ("codex", "market"),
        ("openchain", "signatures"),
        ("openrouter", "summary"),
        ("firecrawl", "retrieval"),
        ("microlink", "metadata"),
        ("jina", "retrieval"),
        ("tavily", "search"),
        ("exa", "search"),
    ):
        renamed = re.sub(rf"(^|_){vendor}(_|$)", rf"\1{replacement}\2", renamed)
    return renamed


def redact_facts(facts: Any) -> Any:
    """Strip supplier names from a facts tree, keys and string values alike.

    Applied to what the summariser is given rather than to what is stored: the
    stored facts stay faithful to the services that produced them, which is
    what makes an execution auditable, while the model never learns a name it
    could repeat.

    Structure is preserved exactly. A renamed key that collides with one
    already present keeps both by leaving the original — losing a fact to
    cosmetics would be a far worse trade than an occasional vendor-shaped key.
    """
    if isinstance(facts, dict):
        result: dict[str, Any] = {}
        for key, value in facts.items():
            renamed = _rename_key(str(key)) if isinstance(key, str) else key
            if renamed in result:
                renamed = str(key)
            result[renamed] = redact_facts(value)
        return result

    if isinstance(facts, list):
        return [redact_facts(item) for item in facts]

    if isinstance(facts, str):
        return describe_source(facts)

    return facts
