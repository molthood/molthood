"""Cache, backed by Upstash Redis or by memory.

The fallback is the point. Every caller writes the same four calls, and
whether they reach Redis or a dictionary is a deployment detail rather than a
code path anyone has to branch on. A machine with no credentials caches in
process; adding `UPSTASH_REDIS_REST_URL` and a token moves the same data to
Redis with nothing else changed.

What the fallback does *not* do is pretend to be Redis. It is per-process and
lost on restart, and `backend` says which one answered — a deployment running
four workers with the memory backend has four caches, and that has to be
visible rather than discovered.
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from typing import Any, ClassVar

from app.logging import get_logger
from app.providers.base import Provider
from app.providers.types import Capability, ProviderResult

logger = get_logger(__name__)

#: Entries held by the in-process fallback before the coldest are dropped.
#: Bounded because an unbounded dictionary in a long-lived process is a leak.
MEMORY_MAX_ENTRIES = 2000

DEFAULT_TTL_SECONDS = 600


@dataclass(slots=True)
class _Entry:
    value: str
    expires_at: float

    @property
    def is_live(self) -> bool:
        return time.monotonic() < self.expires_at


class MemoryCache:
    """Per-process fallback. Correct, bounded, and honest about being neither
    shared nor durable."""

    def __init__(self, max_entries: int = MEMORY_MAX_ENTRIES) -> None:
        self._entries: dict[str, _Entry] = {}
        self._max = max_entries

    def get(self, key: str) -> str | None:
        entry = self._entries.get(key)
        if entry is None:
            return None
        if not entry.is_live:
            # Expiry is enforced on read rather than by a sweeper: nothing else
            # needs to run, and a stale entry nobody reads costs only memory,
            # which the size bound already handles.
            del self._entries[key]
            return None
        return entry.value

    def set(self, key: str, value: str, ttl_seconds: int) -> None:
        if len(self._entries) >= self._max:
            self._evict()
        self._entries[key] = _Entry(value, time.monotonic() + ttl_seconds)

    def delete(self, key: str) -> bool:
        return self._entries.pop(key, None) is not None

    def delete_prefix(self, prefix: str) -> int:
        doomed = [key for key in self._entries if key.startswith(prefix)]
        for key in doomed:
            del self._entries[key]
        return len(doomed)

    def ttl(self, key: str) -> int | None:
        entry = self._entries.get(key)
        if entry is None or not entry.is_live:
            return None
        return max(0, int(entry.expires_at - time.monotonic()))

    def _evict(self) -> None:
        """Drop expired entries; if none have expired, drop the oldest."""
        expired = [key for key, entry in self._entries.items() if not entry.is_live]
        for key in expired:
            del self._entries[key]

        if not expired and self._entries:
            del self._entries[next(iter(self._entries))]


class UpstashRedisProvider(Provider):
    """Namespaced key/value cache with expiry."""

    name: ClassVar[str] = "upstash_redis"
    title: ClassVar[str] = "Upstash Redis"
    description: ClassVar[str] = (
        "Shared cache with expiry. Falls back to an in-process cache when no "
        "credentials are set, so callers never branch on availability."
    )
    capabilities: ClassVar[tuple[Capability, ...]] = (Capability.CACHE,)
    required_env: ClassVar[tuple[str, ...]] = (
        "UPSTASH_REDIS_REST_URL",
        "UPSTASH_REDIS_REST_TOKEN",
    )

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._memory = MemoryCache()

    @property
    def has_credentials(self) -> bool:
        """Both halves are needed. A URL with no token is as good as neither."""
        return bool(self.base_url) and self._api_key is not None

    @property
    def missing_env(self) -> tuple[str, ...]:
        absent: list[str] = []
        if not self.base_url:
            absent.append("UPSTASH_REDIS_REST_URL")
        if self._api_key is None:
            absent.append("UPSTASH_REDIS_REST_TOKEN")
        return tuple(absent)

    @property
    def backend(self) -> str:
        """Which store is actually answering. Surfaced so a deployment cannot
        silently think it has a shared cache when it has four private ones."""
        return "upstash-redis" if self.has_credentials and self._enabled else "memory"

    async def _probe(self) -> str:
        await self._command(["PING"], operation="probe")
        return "Redis responding."

    async def _command(self, parts: list[str], *, operation: str) -> Any:
        """Send one Redis command as a JSON array.

        Upstash offers two forms. The path form — `POST /set/key/EX/60` with
        the value in the body — cannot express `SET`: Redis wants the value
        *before* the options, and a body argument always lands last, producing
        `SET key EX 60 value` and `ERR syntax error`. It also breaks on any key
        or value containing a slash, which JSON is full of.

        The array form has neither problem and expresses every command
        identically, so everything here uses it.
        """
        client = await self.http()
        return await client.post_json("", json_body=parts, operation=operation)

    async def _perform(self, capability: Capability, /, **kwargs: Any) -> ProviderResult:
        operation = str(kwargs.pop("operation", "get"))

        if operation == "set":
            await self.set(**kwargs)
            return ProviderResult.success(self.name, capability, data={"ok": True})
        if operation == "invalidate":
            removed = await self.invalidate(**kwargs)
            return ProviderResult.success(
                self.name, capability, data={"removed": removed}
            )
        if operation == "ttl":
            return ProviderResult.success(
                self.name, capability, data={"ttl": await self.ttl(**kwargs)}
            )

        return ProviderResult.success(
            self.name, capability, data={"value": await self.get(**kwargs)}
        )

    # --- the cache surface -------------------------------------------------
    #
    # These are the methods everything else calls. They never raise: a cache
    # that fails is a slow request, not a broken one, so every error degrades
    # to a miss.

    async def get(self, key: str, *, namespace: str = "default") -> Any:
        """The stored value, or None. A miss and a failure look the same by
        design — both mean "compute it"."""
        full = _namespaced(key, namespace)

        if self.backend == "memory":
            return _decode(self._memory.get(full))

        try:
            payload = await self._command(["GET", full], operation="get")
        except Exception as exc:
            logger.warning("cache_get_failed", key=full, error=str(exc))
            return None

        raw = payload.get("result") if isinstance(payload, dict) else None
        return _decode(raw if isinstance(raw, str) else None)

    async def set(
        self,
        key: str,
        value: Any,
        *,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
        namespace: str = "default",
    ) -> bool:
        full = _namespaced(key, namespace)
        encoded = _encode(value)

        if self.backend == "memory":
            self._memory.set(full, encoded, ttl_seconds)
            return True

        try:
            await self._command(
                ["SET", full, encoded, "EX", str(ttl_seconds)], operation="set"
            )
        except Exception as exc:
            # Logged at warning, not swallowed silently. A write that fails
            # every time turns the cache into a permanent miss, and the only
            # symptom is slowness — this line is how that gets noticed.
            logger.warning("cache_set_failed", key=full, error=str(exc))
            return False
        return True

    async def invalidate(
        self, key: str | None = None, *, namespace: str = "default"
    ) -> int:
        """Drop one key, or the whole namespace when no key is given."""
        if key is not None:
            full = _namespaced(key, namespace)
            if self.backend == "memory":
                return int(self._memory.delete(full))
            try:
                payload = await self._command(["DEL", full], operation="invalidate")
            except Exception as exc:
                logger.warning("cache_invalidate_failed", key=full, error=str(exc))
                return 0
            result = payload.get("result") if isinstance(payload, dict) else 0
            return int(result or 0)

        prefix = f"{namespace}:"
        if self.backend == "memory":
            return self._memory.delete_prefix(prefix)

        # Redis has no atomic prefix delete. SCAN then DEL is the portable
        # shape, and it is bounded per call rather than looping to exhaustion —
        # a namespace with a million keys must not block the caller.
        try:
            payload = await self._command(
                ["SCAN", "0", "MATCH", f"{prefix}*", "COUNT", "500"],
                operation="scan",
            )
        except Exception as exc:
            logger.warning("cache_scan_failed", namespace=namespace, error=str(exc))
            return 0

        keys = _scan_keys(payload)
        if not keys:
            return 0

        try:
            await self._command(["DEL", *keys], operation="invalidate_many")
        except Exception as exc:
            logger.warning("cache_invalidate_many_failed", error=str(exc))
            return 0
        return len(keys)

    async def ttl(self, key: str, *, namespace: str = "default") -> int | None:
        """Seconds remaining, or None when the key is absent or has no expiry."""
        full = _namespaced(key, namespace)

        if self.backend == "memory":
            return self._memory.ttl(full)

        try:
            payload = await self._command(["TTL", full], operation="ttl")
        except Exception as exc:
            logger.warning("cache_ttl_failed", key=full, error=str(exc))
            return None

        raw = payload.get("result") if isinstance(payload, dict) else None
        if not isinstance(raw, int | str):
            return None
        try:
            seconds = int(raw)
        except (TypeError, ValueError):
            return None
        # Redis answers -2 for "no such key" and -1 for "no expiry". Neither is
        # a duration, so neither is returned as one.
        return seconds if seconds >= 0 else None

    async def cache(
        self,
        key: str,
        producer: Any,
        *,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
        namespace: str = "default",
    ) -> Any:
        """Return the cached value, or produce, store, and return it.

        `producer` may be a coroutine function or a plain one. A failure to
        store never fails the call — the value was computed, and handing it
        back is strictly better than raising because the cache is down.
        """
        hit = await self.get(key, namespace=namespace)
        if hit is not None:
            return hit

        value = producer() if callable(producer) else producer
        if asyncio.iscoroutine(value):
            value = await value

        if value is not None:
            await self.set(key, value, ttl_seconds=ttl_seconds, namespace=namespace)
        return value


def _namespaced(key: str, namespace: str) -> str:
    return f"{namespace}:{key}"


def _encode(value: Any) -> str:
    """Store everything as JSON so the type survives the round trip.

    Without this, an integer written to Redis comes back as a string and the
    caller has to remember what it stored.
    """
    return json.dumps(value, default=str)


def _decode(raw: str | None) -> Any:
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        # A value written by something other than this cache. Handing back the
        # raw string beats discarding it.
        return raw


def _scan_keys(payload: Any) -> list[str]:
    """Pull the key list out of a SCAN reply: `[cursor, [keys...]]`."""
    result = payload.get("result") if isinstance(payload, dict) else None
    if not isinstance(result, list) or len(result) < 2:
        return []
    keys = result[1]
    return [key for key in keys if isinstance(key, str)] if isinstance(keys, list) else []
