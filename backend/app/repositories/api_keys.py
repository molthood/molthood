"""Storage and enforcement for API keys.

The quota lives here rather than in the rate limiter for a reason worth stating
plainly: a rate limit protects the *server*, and losing it on restart costs
nothing. This quota protects **money** — every analysis spends real inference
credit — so it has to survive a restart and hold across every worker process.
That means the database, and it means the increment and the check happen in one
transaction.
"""

from __future__ import annotations

import asyncio
import builtins
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any

from sqlalchemy import func, select, update

from app.core.database import get_session_factory
from app.core.exceptions import QuotaExceededError
from app.core.security import display_hint, generate_key, hash_key, looks_like_key
from app.logging import get_logger
from app.models.auth import ApiKey
from app.models.base import utcnow

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class KeyIdentity:
    """The caller, as far as the API is concerned.

    A plain snapshot rather than an ORM row: the session that loaded it is
    closed by the time a route reads this, and a detached instance would raise
    the moment anything touched a lazy attribute.
    """

    id: str
    hint: str
    label: str
    daily_quota: int
    used_today: int
    is_admin: bool

    @property
    def remaining(self) -> int:
        return max(0, self.daily_quota - self.used_today)


@dataclass(frozen=True, slots=True)
class IssuedKey:
    """A newly created key. `secret` is visible exactly once."""

    secret: str
    identity: KeyIdentity


def _next_reset() -> datetime:
    """Midnight UTC, which is when `quota_day` stops matching."""
    tomorrow = datetime.now(UTC).date() + timedelta(days=1)
    return datetime.combine(tomorrow, datetime.min.time(), tzinfo=UTC)


def _identity(row: ApiKey) -> KeyIdentity:
    return KeyIdentity(
        id=row.id,
        hint=row.hint,
        label=row.label,
        daily_quota=row.daily_quota,
        used_today=row.used_today,
        is_admin=row.is_admin,
    )


class ApiKeyStore:
    """Issues, resolves, and meters API keys."""

    # --- issuing ---

    def _create(
        self, label: str, *, quota: int, is_admin: bool, ip: str | None
    ) -> IssuedKey:
        secret = generate_key()

        with get_session_factory()() as session:
            row = ApiKey(
                key_hash=hash_key(secret),
                hint=display_hint(secret),
                label=label[:120],
                daily_quota=quota,
                used_today=0,
                quota_day=datetime.now(UTC).date(),
                is_admin=is_admin,
                created_ip=ip,
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return IssuedKey(secret=secret, identity=_identity(row))

    async def create(
        self,
        label: str = "",
        *,
        quota: int,
        is_admin: bool = False,
        ip: str | None = None,
    ) -> IssuedKey:
        return await asyncio.to_thread(
            self._create, label, quota=quota, is_admin=is_admin, ip=ip
        )

    # --- resolving ---

    def _resolve(self, secret: str) -> KeyIdentity | None:
        if not looks_like_key(secret):
            return None

        with get_session_factory()() as session:
            row = session.scalar(
                select(ApiKey).where(ApiKey.key_hash == hash_key(secret))
            )
            if row is None or row.revoked:
                return None

            # Rolls the counter when the stored day is not today, so the reset
            # needs no scheduler — it happens on the first call of a new day.
            today = datetime.now(UTC).date()
            if row.quota_day != today:
                row.quota_day = today
                row.used_today = 0

            row.last_used_at = utcnow()
            session.commit()
            return _identity(row)

    async def resolve(self, secret: str) -> KeyIdentity | None:
        """The identity behind a bearer token, or None if there is not one."""
        return await asyncio.to_thread(self._resolve, secret)

    # --- metering ---

    def _consume(self, key_id: str) -> int:
        """Charge one analysis, refusing if the allowance is spent.

        The increment is a single guarded `UPDATE`, not a read followed by a
        write. That distinction is the whole correctness of this method: under
        PostgreSQL's default isolation, two concurrent analyses would both read
        `used_today = 49`, both write `50`, and both run — so a fiftieth
        request escapes a fifty-a-day cap. SQLite happens to be safe because it
        serialises writers, which is exactly the kind of accident that survives
        every test and then breaks on the day the database changes.

        Letting the database do the comparison makes it atomic everywhere,
        with no row locks and no dialect-specific syntax.
        """
        today = datetime.now(UTC).date()

        with get_session_factory()() as session:
            # Roll the day first. Guarded on the stored day, so several callers
            # arriving at midnight cannot reset each other's fresh counter.
            session.execute(
                update(ApiKey)
                .where(ApiKey.id == key_id, ApiKey.quota_day != today)
                .values(quota_day=today, used_today=0)
            )

            charged = session.execute(
                update(ApiKey)
                .where(
                    ApiKey.id == key_id,
                    ApiKey.revoked.is_(False),
                    ApiKey.used_today < ApiKey.daily_quota,
                )
                .values(used_today=ApiKey.used_today + 1)
            )
            session.commit()

            row = session.get(ApiKey, key_id)

            if charged.rowcount == 1 and row is not None:
                return int(row.daily_quota - row.used_today)

            # The update matched nothing. Work out which of the three reasons
            # it was, so the caller gets an accurate error rather than a
            # generic refusal.
            if row is None or row.revoked:
                raise QuotaExceededError(
                    "That API key is no longer valid.",
                    code="authentication_required",
                    status_code=401,
                    suggested_action="Create a new key with POST /api/v1/keys.",
                )

            raise QuotaExceededError(
                (
                    f"This key has run {row.used_today} of {row.daily_quota} "
                    "analyses today."
                ),
                details={
                    "used": row.used_today,
                    "quota": row.daily_quota,
                    "resets_at": _next_reset().isoformat(),
                },
            )

    async def consume(self, key_id: str) -> int:
        """Charge one analysis and return what is left. Raises when spent."""
        return await asyncio.to_thread(self._consume, key_id)

    def _refund(self, key_id: str) -> None:
        with get_session_factory()() as session:
            row = session.get(ApiKey, key_id)
            if row is not None and row.used_today > 0:
                row.used_today -= 1
                session.commit()

    async def refund(self, key_id: str) -> None:
        """Give the unit back when the analysis never ran.

        A request rejected before any model was called cost nothing, and
        charging for it would let a bad address quietly eat someone's day.
        """
        try:
            await asyncio.to_thread(self._refund, key_id)
        except Exception as exc:
            logger.warning("quota_refund_failed", error=str(exc), key_id=key_id)

    # --- administration ---

    def count(self) -> int:
        with get_session_factory()() as session:
            return int(session.scalar(select(func.count()).select_from(ApiKey)) or 0)

    def recent_from_ip(self, ip: str, *, within_hours: int) -> int:
        """How many keys this source has created lately.

        Self-serve signup is the one endpoint an anonymous caller can reach, so
        it is also the one that could be used to mint unlimited quota.
        """
        cutoff = utcnow() - timedelta(hours=within_hours)
        with get_session_factory()() as session:
            return int(
                session.scalar(
                    select(func.count())
                    .select_from(ApiKey)
                    .where(ApiKey.created_ip == ip, ApiKey.created_at >= cutoff)
                )
                or 0
            )

    def list(self) -> builtins.list[dict[str, Any]]:
        """Every key, without any secret. For an admin view."""
        with get_session_factory()() as session:
            rows = session.scalars(
                select(ApiKey).order_by(ApiKey.created_at.desc()).limit(200)
            ).all()
            return [
                {
                    "id": row.id,
                    "hint": row.hint,
                    "label": row.label,
                    "daily_quota": row.daily_quota,
                    "used_today": row.used_today,
                    "revoked": row.revoked,
                    "is_admin": row.is_admin,
                    "created_at": row.created_at,
                    "last_used_at": row.last_used_at,
                }
                for row in rows
            ]

    def revoke(self, key_id: str) -> bool:
        with get_session_factory()() as session:
            row = session.get(ApiKey, key_id)
            if row is None:
                return False
            row.revoked = True
            session.commit()
            return True


@lru_cache(maxsize=1)
def get_api_key_store() -> ApiKeyStore:
    return ApiKeyStore()


def quota_reset_at() -> datetime:
    return _next_reset()


def bootstrap_admin_key(label: str = "bootstrap") -> IssuedKey | None:
    """Mint the first key if the platform has none.

    Called at startup so a fresh deployment is reachable by its operator
    without a manual database step. The secret is logged once, because there is
    no other way to deliver it and no other opportunity — after this it is only
    a hash.
    """
    store = get_api_key_store()
    if store.count() > 0:
        return None

    from app.config import get_settings

    issued = store._create(
        label,
        quota=get_settings().admin_daily_quota,
        is_admin=True,
        ip=None,
    )
    logger.warning(
        "bootstrap_admin_key_created",
        key=issued.secret,
        hint=issued.identity.hint,
        note="Store this now. It is not recoverable.",
    )
    return issued
