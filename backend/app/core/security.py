"""API key generation and verification.

Keys are the platform's only identity primitive. There are no passwords and no
sessions, because an execution API is called by programs far more often than by
browsers, and a bearer token is the shape both can use.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

#: Prefixes the key so it is recognisable in a log, a paste, or a secret
#: scanner. GitHub's push protection matches on patterns like this.
KEY_PREFIX = "mk_"

#: 32 bytes of `secrets` entropy, URL-safe encoded. Well beyond brute force.
KEY_ENTROPY_BYTES = 32

#: How much of the key is stored in clear, purely so a person can recognise
#: which of their keys a row refers to. Short enough to be useless alone.
DISPLAY_CHARS = 8


def generate_key() -> str:
    """A new secret. Returned to the caller once and never recoverable."""
    return f"{KEY_PREFIX}{secrets.token_urlsafe(KEY_ENTROPY_BYTES)}"


def hash_key(key: str) -> str:
    """The value stored in the database.

    SHA-256 rather than bcrypt or argon2, and that is deliberate rather than an
    oversight. Those exist to make *guessing* expensive, which matters when the
    secret is a human-chosen password with maybe 30 bits of entropy. This key
    has 256 bits from `secrets`, so an offline attacker gains nothing from a
    slow hash — and a slow hash on every single request would be a real cost,
    since the API verifies a key on every call.

    What matters here is that a database leak does not hand over working keys,
    and a one-way hash achieves that.
    """
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def verify_key(key: str, expected_hash: str) -> bool:
    """Constant-time comparison, so a timing signal cannot leak the hash."""
    return hmac.compare_digest(hash_key(key), expected_hash)


def display_hint(key: str) -> str:
    """The fragment shown in a list so a person can tell their keys apart."""
    body = key.removeprefix(KEY_PREFIX)
    return f"{KEY_PREFIX}{body[:DISPLAY_CHARS]}…"


def looks_like_key(value: str) -> bool:
    """Cheap shape check, so a malformed header fails before a database read."""
    return value.startswith(KEY_PREFIX) and len(value) > len(KEY_PREFIX) + 16
