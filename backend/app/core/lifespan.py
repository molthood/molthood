"""Application startup and shutdown."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from app.agents.registry import agent_registry
from app.config import get_settings
from app.core.database import create_schema
from app.logging import get_logger

logger = get_logger(__name__)


def _warn_about_missing_providers(providers: Any) -> None:
    """Say plainly which variables would enable what.

    A readable line per unavailable provider, once, at startup. The
    alternative is an operator discovering a missing key when a request
    silently skips a step — the whole point of naming it here is that the
    information arrives before anyone needs it.
    """
    from app.providers.types import ProviderState

    for status in providers.statuses():
        if status.state is ProviderState.MISSING_KEY:
            logger.warning(
                "provider_unconfigured",
                provider=status.name,
                set_to_enable=", ".join(status.required_env),
                unlocks=", ".join(item.value for item in status.capabilities),
            )
        elif status.state is ProviderState.UNAVAILABLE:
            logger.warning(
                "provider_unavailable",
                provider=status.name,
                detail=status.detail,
            )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()

    agent_registry.autoload()

    # A failure here must not stop the server. Every analysis works without
    # storage; losing it costs history and caching, not answers — and the log
    # says so plainly rather than the app appearing healthy while silently
    # discarding every run.
    database = "connected"
    try:
        create_schema()
    except Exception as exc:
        database = f"unavailable ({type(exc).__name__})"
        logger.warning("database_unavailable", error=str(exc))

    # Mint the operator's key on a fresh deployment, so the platform is
    # reachable by whoever started it without a manual database step. Only
    # runs when there are no keys at all, and the secret is logged once —
    # after this it exists solely as a hash and cannot be recovered.
    if database == "connected" and settings.auth_required:
        try:
            from app.repositories.api_keys import bootstrap_admin_key

            bootstrap_admin_key()
        except Exception as exc:
            logger.warning("bootstrap_key_failed", error=str(exc))

    # Probe every capability provider. Never raises: a missing key, a wrong
    # key, and a dead upstream are all recorded and the application starts
    # anyway. That is the property that makes "paste a key and restart" the
    # whole enablement story.
    from app.providers.manager import get_provider_manager

    providers = get_provider_manager()
    try:
        provider_states = await providers.initialize()
    except Exception as exc:
        provider_states = {}
        logger.warning("provider_initialization_failed", error=str(exc))

    _warn_about_missing_providers(providers)

    # The background monitor. Held so shutdown can cancel it — without the
    # reference the task is garbage-collectable mid-check, and Python will
    # collect a running task whose only reference was a local.
    monitor: asyncio.Task[None] | None = None
    if settings.monitor_enabled and database == "connected":
        from app.engine.monitor import monitor_loop

        monitor = asyncio.create_task(monitor_loop())

    logger.info(
        "application_startup",
        monitor="running" if monitor else "disabled",
        providers_usable=sum(
            1 for state in provider_states.values() if state in ("healthy", "enabled")
        ),
        providers_total=len(provider_states),
        app=settings.app_name,
        version=settings.app_version,
        env=settings.app_env,
        api_prefix=settings.api_prefix,
        agents_registered=len(agent_registry.list()),
        database=database,
        redis="configured_not_connected",
    )

    yield

    await providers.aclose()

    if monitor is not None:
        monitor.cancel()
        # Awaited so a check in flight finishes unwinding before the process
        # exits; otherwise the loop is torn down mid-transaction.
        await asyncio.gather(monitor, return_exceptions=True)

    logger.info("application_shutdown", app=settings.app_name)
