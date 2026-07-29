"""Database and cache wiring.

Factories are lazy so importing this module never opens a socket.

The default database is SQLite in a local file. That choice is deliberate: an
execution history that vanishes on restart made the console show real data
that then disappeared, which is its own kind of dishonesty. SQLite makes the
history durable on any machine with nothing installed, and because everything
goes through the ORM, moving to PostgreSQL is a `DATABASE_URL` change.
"""

from __future__ import annotations

from collections.abc import Iterator
from functools import lru_cache
from typing import TYPE_CHECKING, Any

from app.config import get_settings
from app.core.exceptions import NotImplementedYetError
from app.logging import get_logger

if TYPE_CHECKING:  # pragma: no cover - typing only
    from sqlalchemy.engine import Engine
    from sqlalchemy.orm import Session

logger = get_logger(__name__)


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Create the SQLAlchemy engine on first use.

    `create_engine` does not connect; the pool stays empty until a connection
    is checked out.
    """
    from sqlalchemy import create_engine

    settings = get_settings()
    url = settings.database_url

    # SQLite refuses a connection created on one thread and used on another.
    # Every write here goes through `asyncio.to_thread`, so the connection
    # legitimately crosses threads and the check has to be relaxed; the pool
    # still serialises access.
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}

    return create_engine(
        url,
        pool_pre_ping=True,
        future=True,
        echo=False,
        connect_args=connect_args,
        # Evidence rows carry a `created_at`, and the default encoder refuses
        # datetimes — which silently turned every write into a logged warning
        # and an empty history. Handled once here rather than by flattening
        # timestamps at each call site.
        json_serializer=_dump_json,
    )


def _dump_json(value: Any) -> str:
    """Serialize a JSON column, rendering datetimes as ISO-8601."""
    import json
    from datetime import date, datetime

    def encode(item: Any) -> str:
        if isinstance(item, datetime | date):
            return item.isoformat()
        raise TypeError(f"{type(item).__name__} is not JSON serializable")

    return json.dumps(value, default=encode)


def create_schema() -> None:
    """Bring the database up to the models it is asked to store.

    `create_all` adds missing *tables* and nothing else — it will not touch a
    table that already exists. That gap bit for real: adding `api_key_id` to
    `executions` left eight live rows in a database whose schema no longer
    matched the model, and every write failed at runtime rather than at start.

    So this also adds missing *columns*. Additive changes only, which is what
    both SQLite and PostgreSQL support with a plain `ALTER TABLE ... ADD
    COLUMN`. Anything else — a rename, a type change, a backfill — still needs
    a real migration, and Alembic is configured for exactly that.
    """
    # Imported for their side effect: a model must be imported before
    # `create_all` can see its table.
    from app.models import (  # noqa: F401
        agent,
        auth,
        execution,
        project,
        report,
        watch,
    )
    from app.models.base import Base

    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    _add_missing_columns(engine)


def _add_missing_columns(engine: Engine) -> None:
    """Add columns the models declare and the tables lack."""
    from sqlalchemy import inspect, text
    from sqlalchemy.schema import CreateColumn

    from app.models.base import Base

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue

        present = {column["name"] for column in inspector.get_columns(table.name)}
        missing = [column for column in table.columns if column.name not in present]

        for column in missing:
            # A column added to a populated table must be nullable or carry a
            # default; the models satisfy that, and a violation should fail
            # loudly here rather than silently at the first write.
            # Table and column names come from our own model metadata, never
            # from a request, so the interpolation cannot carry user input.
            spec = str(CreateColumn(column).compile(engine))  # type: ignore[no-untyped-call]
            try:
                with engine.begin() as connection:
                    connection.execute(
                        text(f"ALTER TABLE {table.name} ADD COLUMN {spec}")
                    )
            except Exception as exc:
                # Almost always one cause: a NOT NULL column whose default is
                # Python-side only. `default=` fills rows this application
                # inserts; existing rows need `server_default=` because the
                # database is the one filling them.
                raise RuntimeError(
                    f"Could not add {table.name}.{column.name}. A NOT NULL "
                    "column added to a populated table needs `server_default=`, "
                    "not just `default=`."
                ) from exc
            logger.info("schema_column_added", table=table.name, column=column.name)


@lru_cache(maxsize=1)
def get_session_factory() -> Any:
    from sqlalchemy.orm import sessionmaker

    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a database session.

    Not wired to any route in Phase 3 — persistence lands in Phase 4.
    """
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@lru_cache(maxsize=1)
def get_redis() -> Any:
    """Build the Redis client. Lazy for the same reason as the engine."""
    import redis

    settings = get_settings()
    return redis.Redis.from_url(settings.redis_url, decode_responses=True)


def require_database() -> None:
    """Guard for code paths that would need a live database."""
    raise NotImplementedYetError(
        "Database persistence is not enabled in this phase.",
        details={"phase": 3, "enabled_in": "phase_4"},
    )
