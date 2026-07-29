"""`/api/v1/watches` — subjects to keep looking at.

The difference between a tool you use and a tool you leave running. Change
detection already produces the finding; a watch is what causes anyone to be
looking when it happens.

Every check spends a unit of the owner's analysis quota, exactly as a manual
run does. That is stated in the API description rather than buried, because a
watchlist that quietly drains an allowance is worse than no watchlist.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Path, status
from pydantic import Field, field_validator

from app.api.auth import CurrentKey
from app.config import get_settings
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.engine.router import AnalysisTarget
from app.repositories.watches import MAX_PER_KEY, get_watch_store
from app.schemas.common import SchemaBase
from app.utils.validation import validate_address

router = APIRouter(tags=["watches"])

#: Targets worth watching. A website is excluded deliberately: a site analysis
#: takes fifteen-odd seconds against third-party hosts, and putting that on a
#: repeating timer is closer to monitoring somebody else's server than to
#: watching a subject we have a relationship with.
WATCHABLE = {
    AnalysisTarget.TOKEN,
    AnalysisTarget.CONTRACT,
    AnalysisTarget.WALLET,
    AnalysisTarget.PROJECT,
}


class WatchCreate(SchemaBase):
    target: AnalysisTarget = Field(description="token, contract, wallet, or project.")
    address: str | None = Field(
        default=None, description="Required for everything except `project`."
    )
    label: str = Field(default="", max_length=120)
    interval_seconds: int | None = Field(
        default=None,
        description=(
            "How often to check. Floored by the server, since each check "
            "spends a unit of this key's quota."
        ),
    )

    @field_validator("target")
    @classmethod
    def _watchable(cls, value: AnalysisTarget) -> AnalysisTarget:
        if value not in WATCHABLE:
            raise ValueError(
                f"{value.value} cannot be watched. Watchable: "
                + ", ".join(sorted(item.value for item in WATCHABLE))
            )
        return value


@router.get("", summary="List your watchlist")
async def list_watches(identity: CurrentKey) -> dict[str, Any]:
    settings = get_settings()
    items = get_watch_store().list(identity.id)

    return {
        "items": [item.to_dict() for item in items],
        "total": len(items),
        "limit": MAX_PER_KEY,
        "monitor_running": settings.monitor_enabled,
        "note": (
            "Each check runs a full analysis and spends one unit of this key's "
            "daily quota."
            if settings.monitor_enabled
            else (
                "Background monitoring is disabled on this deployment, so these "
                "are recorded but not being checked. Set MONITOR_ENABLED=true "
                "to start it."
            )
        ),
    }


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Watch a subject",
    description=(
        "Re-runs the analysis on a schedule and records what changed. Each "
        "check costs one unit of this key's daily analysis quota."
    ),
)
async def create_watch(payload: WatchCreate, identity: CurrentKey) -> dict[str, Any]:
    settings = get_settings()
    store = get_watch_store()

    address: str | None = None
    if payload.target is not AnalysisTarget.PROJECT:
        if not payload.address:
            raise ValidationError(
                f"A {payload.target.value} watch needs an address.",
                details={"target": payload.target.value},
            )
        address = validate_address(payload.address)

    if store.count_for(identity.id) >= MAX_PER_KEY:
        raise ConflictError(
            f"This key already holds the maximum of {MAX_PER_KEY} watches.",
            suggested_action="Remove one before adding another.",
        )

    # Floored rather than rejected: someone asking for every minute wants
    # frequent checks, and silently giving them the fastest allowed is more
    # useful than an error about a number they had no way to know.
    requested = payload.interval_seconds or settings.watch_default_interval_seconds
    interval = max(requested, settings.watch_min_interval_seconds)

    record = await store.create(
        owner_key_id=identity.id,
        target=payload.target.value,
        address=address,
        label=payload.label,
        interval_seconds=interval,
    )

    if record is None:
        raise ConflictError(
            "You are already watching this subject.",
            details={"target": payload.target.value, "address": address},
            suggested_action="Open the existing watch instead of adding a second.",
        )

    return {
        "watch": record.to_dict(),
        "interval_seconds": interval,
        "interval_was_floored": interval != requested,
    }


@router.get("/{watch_id}", summary="Retrieve one watch")
async def get_watch(
    identity: CurrentKey,
    watch_id: str = Path(description="Watch id returned by POST /watches."),
) -> dict[str, Any]:
    record = get_watch_store().get(watch_id, identity.id)
    if record is None:
        raise _not_found(watch_id)
    return record.to_dict()


@router.post("/{watch_id}/pause", summary="Stop checking a watch")
async def pause_watch(identity: CurrentKey, watch_id: str) -> dict[str, Any]:
    if not get_watch_store().set_active(watch_id, identity.id, False):
        raise _not_found(watch_id)
    return {"id": watch_id, "active": False}


@router.post("/{watch_id}/resume", summary="Start checking a watch again")
async def resume_watch(identity: CurrentKey, watch_id: str) -> dict[str, Any]:
    if not get_watch_store().set_active(watch_id, identity.id, True):
        raise _not_found(watch_id)
    return {"id": watch_id, "active": True}


@router.delete("/{watch_id}", summary="Remove a watch")
async def delete_watch(identity: CurrentKey, watch_id: str) -> dict[str, Any]:
    if not get_watch_store().delete(watch_id, identity.id):
        raise _not_found(watch_id)
    return {"id": watch_id, "deleted": True}


def _not_found(watch_id: str) -> NotFoundError:
    """One message whether it is missing or simply not the caller's."""
    return NotFoundError(
        f"No watch found with id '{watch_id}'.",
        details={"watch_id": watch_id},
        suggested_action="Check the id, or list your watches.",
    )
