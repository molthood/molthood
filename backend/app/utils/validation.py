"""Input validation and sanitization.

Every value that reaches a service client passes through here first. Addresses
are interpolated into upstream URLs, so accepting an unvalidated string would
let a caller reshape our outbound requests.
"""

from __future__ import annotations

import re

from app.core.exceptions import ValidationError

#: A 20-byte hex address. Anchored — no prefix or suffix is tolerated.
ADDRESS_PATTERN = re.compile(r"^0x[0-9a-fA-F]{40}$")

#: A 32-byte transaction hash.
TX_HASH_PATTERN = re.compile(r"^0x[0-9a-fA-F]{64}$")

#: Finds an address anywhere inside free-form request text.
ADDRESS_IN_TEXT = re.compile(r"0x[0-9a-fA-F]{40}")

#: A hostname with a TLD of at least two letters, so ordinary prose ("v0.8.26",
#: "e.g.") is not mistaken for a domain.
_DOMAIN = r"(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}"

#: Address literals are only recognised with an explicit scheme. A bare
#: "127.0.0.1" is indistinguishable from a version string, but
#: "http://127.0.0.1/" is unambiguous — and must be *matched* so the SSRF guard
#: is what rejects it, with an accurate message, rather than routing failing
#: earlier with a misleading "needs a URL".
_HOST_LITERAL = r"\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\]"

#: Finds a URL or bare domain in free-form text.
URL_IN_TEXT = re.compile(
    rf"\b(?:https?://(?:{_DOMAIN}|{_HOST_LITERAL})|{_DOMAIN})(?::\d{{1,5}})?"
    r"(?:/[^\s]*)?",
    re.IGNORECASE,
)

#: Words that look like domains but are almost never analysis targets.
_DOMAIN_STOPWORDS = frozenset({"e.g", "i.e", "etc", "vs"})

MAX_REQUEST_LENGTH = 2000


def validate_address(value: str) -> str:
    """Validate a hex address and return it normalised to lowercase.

    Raises `ValidationError` (422) rather than passing anything unexpected to
    an upstream URL.
    """
    candidate = (value or "").strip()

    if not ADDRESS_PATTERN.match(candidate):
        raise ValidationError(
            "That is not a valid address.",
            details={"received": candidate[:80]},
            suggested_action=(
                "Provide a 42-character hex address starting with 0x, "
                "for example 0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34."
            ),
        )

    return candidate.lower()


def validate_tx_hash(value: str) -> str:
    candidate = (value or "").strip()

    if not TX_HASH_PATTERN.match(candidate):
        raise ValidationError(
            "That is not a valid transaction hash.",
            details={"received": candidate[:80]},
            suggested_action="Provide a 66-character hex hash starting with 0x.",
        )

    return candidate.lower()


def extract_address(text: str) -> str | None:
    """Pull the first address out of free-form request text, if present."""
    match = ADDRESS_IN_TEXT.search(text or "")
    return match.group(0).lower() if match else None


def extract_url(text: str) -> str | None:
    """Pull the first URL or bare domain out of free-form request text.

    Skips anything that also matches an address, so a request naming a contract
    is never mistaken for a website.
    """
    haystack = ADDRESS_IN_TEXT.sub(" ", text or "")

    for match in URL_IN_TEXT.finditer(haystack):
        candidate = match.group(0).rstrip(".,;:)")
        stem = candidate.split("/")[0].lower()
        if stem.rsplit(".", 1)[0] in _DOMAIN_STOPWORDS:
            continue
        return candidate

    return None


def sanitize_request_text(value: str) -> str:
    """Normalise a user-supplied request string.

    Strips control characters (which would corrupt log lines and prompts),
    collapses whitespace, and enforces a length ceiling.
    """
    raw = (value or "").strip()

    if not raw:
        raise ValidationError(
            "The request text is empty.",
            suggested_action="Describe what you want analysed, or pass an address.",
        )

    if len(raw) > MAX_REQUEST_LENGTH:
        raise ValidationError(
            f"The request exceeds {MAX_REQUEST_LENGTH} characters.",
            details={"length": len(raw)},
            suggested_action="Shorten the request and resubmit.",
        )

    cleaned = "".join(char for char in raw if char.isprintable() or char in "\n\t")
    return re.sub(r"\s+", " ", cleaned).strip()
