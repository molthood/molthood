"""`/api/v1/hooks` — where QStash delivers the work it was given.

Publishing is only half of a queue. Every message QStash holds becomes a
request this service later receives *from the public internet*, so the
receiving end is a security boundary: without signature verification, anyone
who learns the URL can make the platform run whatever the endpoint runs.

QStash signs each delivery with an HMAC over the body, using the current and
previous signing keys. Both are checked so a key rotation does not drop
messages already in flight.

This route exists before there is anywhere to deliver to. That is deliberate:
the verification is pure computation and can be tested now, so deploy day
needs no new code — only `QSTASH_CALLBACK_BASE_URL` and the two signing keys.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any

from fastapi import APIRouter, Header, Request, status

from app.config import get_settings
from app.core.exceptions import AuthenticationError
from app.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["hooks"])

#: How much clock skew to tolerate on the signature's expiry claim.
_CLOCK_SKEW_SECONDS = 60


def _b64url_decode(value: str) -> bytes:
    """Decode base64url that may have had its padding stripped."""
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def verify_signature(signature: str, body: bytes, keys: list[str]) -> tuple[bool, str]:
    """Whether a delivery genuinely came from QStash.

    The signature is a compact JWS: `header.payload.signature`, signed HS256
    over `header.payload`. The payload carries the body's SHA-256, so checking
    the signature alone is not enough — a valid signature over a *different*
    body would otherwise pass.

    Returns a reason on failure rather than a bare False, because a rejected
    delivery is something an operator has to diagnose and "invalid" says
    nothing about which part was wrong.
    """
    if not signature:
        return False, "No Upstash-Signature header."

    parts = signature.split(".")
    if len(parts) != 3:
        return False, "Signature is not a well-formed JWS."

    header_b64, payload_b64, provided = parts
    signing_input = f"{header_b64}.{payload_b64}".encode()

    matched = False
    for key in keys:
        if not key:
            continue
        expected = (
            base64.urlsafe_b64encode(
                hmac.new(key.encode(), signing_input, hashlib.sha256).digest()
            )
            .rstrip(b"=")
            .decode()
        )
        # Constant time: a short-circuiting compare leaks how much of the
        # signature was right, one byte at a time.
        if hmac.compare_digest(expected, provided):
            matched = True
            break

    if not matched:
        return False, "Signature does not match either signing key."

    try:
        claims = json.loads(_b64url_decode(payload_b64))
    except Exception:
        return False, "Signature payload is not readable JSON."

    expiry = claims.get("exp")
    if isinstance(expiry, int | float) and time.time() > expiry + _CLOCK_SKEW_SECONDS:
        return False, "Signature has expired."

    # The body hash is what binds the signature to *this* payload. Without it a
    # captured signature could be replayed over anything.
    body_hash = claims.get("body")
    if isinstance(body_hash, str) and body_hash:
        actual = base64.urlsafe_b64encode(hashlib.sha256(body).digest())
        if not hmac.compare_digest(actual.rstrip(b"=").decode(), body_hash.rstrip("=")):
            return False, "Body does not match the hash the signature covers."

    return True, "Verified."


@router.post(
    "/qstash",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Receive a QStash delivery",
    description=(
        "Every delivery is signature-verified before anything runs. Without "
        "`QSTASH_CURRENT_SIGNING_KEY` the endpoint refuses everything — an "
        "unverified public endpoint that executes work is worse than no queue "
        "at all."
    ),
)
async def receive(
    request: Request,
    upstash_signature: str = Header(default="", alias="Upstash-Signature"),
) -> dict[str, Any]:
    settings = get_settings()

    keys = [
        settings.qstash_current_signing_key.get_secret_value()
        if settings.qstash_current_signing_key
        else "",
        settings.qstash_next_signing_key.get_secret_value()
        if settings.qstash_next_signing_key
        else "",
    ]

    if not any(keys):
        # Refusing is the only safe default. Accepting unverified deliveries
        # would let anyone who guesses this URL run whatever it dispatches.
        raise AuthenticationError(
            "Queue deliveries are not accepted: no signing key is configured.",
            code="signing_key_missing",
            suggested_action=(
                "Set QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY "
                "from the QStash console."
            ),
        )

    body = await request.body()
    valid, reason = verify_signature(upstash_signature, body, keys)

    if not valid:
        logger.warning("qstash_delivery_rejected", reason=reason)
        raise AuthenticationError(
            f"Rejected this delivery: {reason}",
            code="invalid_signature",
            suggested_action="Confirm the signing keys match the QStash console.",
        )

    try:
        payload = json.loads(body) if body else {}
    except json.JSONDecodeError:
        payload = {}

    job = str(payload.get("job") or "unknown")
    logger.info("qstash_delivery_accepted", job=job)

    # Dispatch lands here once there is deferred work to run. Accepting and
    # naming the job rather than pretending to have handled it: QStash retries
    # anything that does not return 2xx, and silently succeeding on an unknown
    # job would drop it forever.
    return {
        "accepted": True,
        "job": job,
        "handled": False,
        "detail": (
            "Delivery verified. No handler is registered for this job yet, so "
            "nothing was executed."
        ),
    }
