"""Unversioned system endpoints: `/health` and `/version`.

Deliberately outside `/api/v1` — orchestrators probe these, and they must not
move when the API version changes.
"""

from __future__ import annotations

import platform
import re
import time
from typing import Any

from fastapi import APIRouter

from app.api.deps import SettingsDep
from app.schemas.system import HealthResponse, VersionResponse
from app.utils.time import utcnow

router = APIRouter(tags=["system"])

#: Captured at import so `/health` can report process uptime.
_STARTED_AT = time.monotonic()
#: The same instant as wall-clock, for a dashboard that wants to show when the
#: process actually started rather than how long it has been up.
_STARTED_AT_WALL = utcnow()


def uptime_seconds() -> float:
    return round(time.monotonic() - _STARTED_AT, 3)


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Liveness probe",
    description="Returns 200 whenever the process is serving traffic.",
)
async def health() -> HealthResponse:
    return HealthResponse(uptime_seconds=uptime_seconds(), timestamp=utcnow())


@router.get(
    "/api/health",
    summary="Full readiness: every provider, every missing key",
    description=(
        "Diagnostic detail, deliberately separate from `/health`. That one is "
        "a liveness probe and must stay a flat 200 — a process reporting "
        "`degraded` because a provider has no API key would be restarted by an "
        "orchestrator, which fixes nothing and drops live requests. This "
        "endpoint is what a human or a dashboard reads."
    ),
)
async def api_health(settings: SettingsDep) -> dict[str, Any]:
    from app.providers.manager import get_provider_manager

    started = time.perf_counter()
    manager = get_provider_manager()
    await manager.refresh()

    snapshot = manager.snapshot()
    providers: list[dict[str, Any]] = snapshot["providers"]

    unavailable = [
        item for item in providers if item["state"] in ("unavailable", "rate_limited")
    ]
    missing = sorted(
        {
            variable
            for item in providers
            if item["state"] == "missing_key"
            for variable in item["missing_env"]
        }
    )

    database = _database_health()

    # `degraded` means something that was working is not. A provider with no
    # key was never expected to work here, so it does not degrade anything —
    # otherwise every fresh deployment would report itself as broken.
    #
    # A database that will not answer is different in kind: nothing is stored,
    # no history exists, and every quota check silently passes. That is a
    # degraded deployment however healthy the providers look.
    status = "degraded" if unavailable or not database["reachable"] else "ok"

    return {
        "status": status,
        "version": settings.app_version,
        "environment": settings.app_env,
        "uptime_seconds": uptime_seconds(),
        "started_at": _STARTED_AT_WALL.isoformat(),
        "timestamp": utcnow().isoformat(),
        "response_time_ms": round((time.perf_counter() - started) * 1000, 2),
        "providers": {
            "total": snapshot["total"],
            "usable": snapshot["usable"],
            "initialized": snapshot["initialized"],
            "items": providers,
            "unavailable": [item["name"] for item in unavailable],
        },
        "capabilities": snapshot["capabilities"],
        "cache_backend": snapshot["cache_backend"],
        "database": database,
        #: Every variable that would enable something currently switched off.
        #: The whole point of the endpoint: an operator reads this and knows
        #: exactly what to add.
        "missing_keys": missing,
    }


def _scrub_credentials(message: str) -> str:
    """Remove any `user:password@` pair from a message before publishing it.

    `/api/health` is unauthenticated, and a connection error is one of the few
    places a driver may quote the DSN it was handed. The observed failures do
    not — but "does not today" is not a property worth relying on for a public
    endpoint, and the cost of being wrong is the production database password.
    """
    return re.sub(r"//[^/\s@]+:[^/\s@]+@", "//***:***@", message)


def _database_health() -> dict[str, Any]:
    """Whether storage can actually be *used*, and which kind it is.

    Startup tolerates a missing database on purpose — an analysis works without
    one, and refusing to boot would trade a partial service for none. The cost
    is that a misconfigured deployment serves traffic and stores nothing, which
    is invisible from outside. This is where it becomes visible.

    Connectivity is checked *and so is the schema*, because they fail
    separately and the difference is the whole diagnosis. On the first real
    deployment `create_schema()` was rejected by PostgreSQL and not one table
    was created — while `SELECT 1` answered perfectly. Reporting that as
    healthy is the same error this codebase exists to refuse: a check that
    could not run rendered as a check that came back clean.

    Credentials never appear here; only the dialect, which is what an operator
    is checking anyway ("did it pick up Postgres, or is it writing to a SQLite
    file that dies with the container?").
    """
    from sqlalchemy import inspect, text

    from app.core.database import get_engine
    from app.models.base import Base

    try:
        engine = get_engine()
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:
        return {
            "reachable": False,
            "tables": None,
            "missing_tables": None,
            "dialect": None,
            "detail": _scrub_credentials(f"{type(exc).__name__}: {exc}"),
            "ephemeral": None,
        }

    dialect = engine.dialect.name

    detail: str | None = None
    try:
        present = set(inspect(engine).get_table_names())
    except Exception as exc:
        present = set()
        detail = _scrub_credentials(f"{type(exc).__name__}: {exc}")

    expected = {table.name for table in Base.metadata.sorted_tables}
    missing = sorted(expected - present)

    if missing and detail is None:
        detail = (
            f"{len(missing)} table(s) the models declare do not exist. "
            "Schema creation failed at startup; check the logs for "
            "`database_unavailable`."
        )

    return {
        # Connected but schema-less is not usable, and must not read as ok.
        "reachable": not missing and detail is None,
        "tables": len(present),
        "missing_tables": missing,
        "dialect": dialect,
        "detail": detail,
        # SQLite on a container filesystem loses every execution, key, and
        # watch on the next deploy. Nothing errors — it just forgets, which is
        # worth saying out loud.
        "ephemeral": dialect == "sqlite",
    }


@router.get(
    "/version",
    response_model=VersionResponse,
    summary="Build and environment information",
)
async def version(settings: SettingsDep) -> VersionResponse:
    return VersionResponse(
        name=settings.app_name,
        version=settings.app_version,
        environment=settings.app_env,
        api_prefix=settings.api_prefix,
        python_version=platform.python_version(),
    )
