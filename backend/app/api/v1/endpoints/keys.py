"""`/api/v1/keys` — the credential a caller analyses with.

Self-serve, because an analysis platform nobody can get into is not useful, and
capped per source, because self-serve signup is otherwise just a slower route to
unlimited quota.

The secret is returned exactly once. Only its hash is stored, so there is no
endpoint that can show it again — which is the property that makes a leaked
database not a leaked set of working keys.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, status
from pydantic import Field

from app.api.auth import AdminKey, ClientIP, CurrentKey
from app.config import get_settings
from app.core.exceptions import RateLimitError
from app.repositories.api_keys import get_api_key_store, quota_reset_at
from app.schemas.common import SchemaBase

router = APIRouter(tags=["keys"])


class KeyCreate(SchemaBase):
    label: str = Field(
        default="",
        max_length=120,
        description="A name for this key, so you can tell it from your others.",
    )


class KeyIssued(SchemaBase):
    """The one response that ever carries a secret."""

    key: str = Field(
        description=("Store this now. It is hashed on arrival and cannot be shown again.")
    )
    hint: str
    label: str
    daily_quota: int
    note: str


class KeyInfo(SchemaBase):
    hint: str
    label: str
    daily_quota: int
    used_today: int
    remaining: int
    resets_at: str
    is_admin: bool


@router.post(
    "",
    response_model=KeyIssued,
    status_code=status.HTTP_201_CREATED,
    summary="Create an API key",
    description=(
        "Returns a new key once. Analyses require one and are metered against "
        "it daily, because each analysis spends real inference credit."
    ),
)
async def create_key(payload: KeyCreate, ip: ClientIP) -> KeyIssued:
    settings = get_settings()
    store = get_api_key_store()

    allowance = settings.signup_keys_per_ip_per_day
    if allowance <= 0:
        raise RateLimitError(
            "Self-serve key creation is disabled on this deployment.",
            code="signup_disabled",
            status_code=403,
            suggested_action="Ask the operator for a key.",
        )

    minted = store.recent_from_ip(ip, within_hours=24)
    if minted >= allowance:
        raise RateLimitError(
            f"This address has already created {minted} keys today.",
            code="signup_rate_limited",
            details={"limit": allowance, "resets_at": quota_reset_at().isoformat()},
            suggested_action="Use a key you already have, or try again tomorrow.",
        )

    issued = await store.create(payload.label, quota=settings.default_daily_quota, ip=ip)

    return KeyIssued(
        key=issued.secret,
        hint=issued.identity.hint,
        label=issued.identity.label,
        daily_quota=issued.identity.daily_quota,
        note=(
            "This is the only time this key is shown. It is stored as a hash, "
            "so it cannot be recovered — create a new one if you lose it."
        ),
    )


@router.get(
    "/me",
    response_model=KeyInfo,
    summary="Inspect the key you are using",
    description="Quota, usage, and when the allowance resets.",
)
async def describe_key(identity: CurrentKey) -> KeyInfo:
    return KeyInfo(
        hint=identity.hint,
        label=identity.label,
        daily_quota=identity.daily_quota,
        used_today=identity.used_today,
        remaining=identity.remaining,
        resets_at=quota_reset_at().isoformat(),
        is_admin=identity.is_admin,
    )


@router.get(
    "",
    summary="List every key",
    description="Administrative. Secrets are never included — only hints.",
)
async def list_keys(_: AdminKey) -> dict[str, Any]:
    keys = get_api_key_store().list()
    return {"items": keys, "total": len(keys)}


@router.post("/{key_id}/revoke", summary="Revoke a key")
async def revoke_key(key_id: str, _: AdminKey) -> dict[str, Any]:
    revoked = get_api_key_store().revoke(key_id)
    return {"revoked": revoked, "id": key_id}
