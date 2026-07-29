"""Turning a bearer token into a caller.

Three dependencies, because three kinds of route need three different answers:

* `CurrentKey` — required. Used by anything that spends inference credit.
* `OptionalKey` — resolved if present, absent otherwise. Used by reads, which
  cost nothing but still need to know whose history to show.
* `AdminKey` — required and privileged.

Charging the quota is deliberately *not* done here. A dependency runs before
the route body, so metering at this point would bill a caller for an analysis
that a validation error stops a moment later.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings
from app.core.exceptions import AuthenticationError
from app.repositories.api_keys import KeyIdentity, get_api_key_store

#: `auto_error=False` so a missing header reaches our own handler and returns
#: the standard envelope rather than FastAPI's bare `{"detail": ...}`.
_bearer = HTTPBearer(auto_error=False, scheme_name="API key")

_BearerDep = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]

#: Identity used when `AUTH_REQUIRED=false`. It is not a real key and cannot be
#: metered, which is exactly why that mode is unsuitable for a public
#: deployment — there is nothing to charge and nothing to scope history by.
_OPEN_MODE = KeyIdentity(
    id="open-mode",
    hint="open",
    label="Authentication disabled",
    daily_quota=0,
    used_today=0,
    is_admin=True,
)


async def optional_key(credentials: _BearerDep) -> KeyIdentity | None:
    """The caller, if they presented a valid key."""
    if credentials is None or not credentials.credentials:
        return None
    return await get_api_key_store().resolve(credentials.credentials)


async def current_key(credentials: _BearerDep) -> KeyIdentity:
    """The caller. Refuses the request if there is not one."""
    if not get_settings().auth_required:
        return _OPEN_MODE

    if credentials is None or not credentials.credentials:
        raise AuthenticationError()

    identity = await get_api_key_store().resolve(credentials.credentials)
    if identity is None:
        # One message for "no such key" and "revoked key" alike: distinguishing
        # them would confirm to a prober which of their guesses once existed.
        raise AuthenticationError(
            "That API key is not valid.",
            suggested_action="Check the key, or create a new one with POST /api/v1/keys.",
        )

    return identity


async def admin_key(
    identity: Annotated[KeyIdentity, Depends(current_key)],
) -> KeyIdentity:
    if not identity.is_admin:
        raise AuthenticationError(
            "This endpoint requires an administrative key.",
            code="forbidden",
            status_code=403,
            suggested_action="Use the key created when the platform was first started.",
        )
    return identity


def request_ip(request: Request) -> str:
    from app.middleware.rate_limit import client_ip

    return client_ip(request)


CurrentKey = Annotated[KeyIdentity, Depends(current_key)]
OptionalKey = Annotated[KeyIdentity | None, Depends(optional_key)]
AdminKey = Annotated[KeyIdentity, Depends(admin_key)]
ClientIP = Annotated[str, Depends(request_ip)]
