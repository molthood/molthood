"""Settings parsing."""

from __future__ import annotations

from sqlalchemy import types as sqltypes

from app.config.settings import Settings


def test_cors_origins_accepts_comma_separated_string() -> None:
    settings = Settings(CORS_ORIGINS="http://a.test, http://b.test")  # type: ignore[call-arg]

    assert settings.cors_origins == ["http://a.test", "http://b.test"]


def test_blank_api_key_is_treated_as_unset() -> None:
    """`CODEX_API_KEY=` in .env must not read as a configured credential."""
    settings = Settings(CODEX_API_KEY="", OPENROUTER_API_KEY="   ")  # type: ignore[call-arg]

    assert settings.codex_api_key is None
    assert settings.openrouter_api_key is None


def test_present_api_key_is_kept_secret() -> None:
    settings = Settings(CODEX_API_KEY="sk-test-value")  # type: ignore[call-arg]

    assert settings.codex_api_key is not None
    assert settings.codex_api_key.get_secret_value() == "sk-test-value"
    # SecretStr must not leak the value through its repr.
    assert "sk-test-value" not in repr(settings.codex_api_key)


def test_log_level_is_normalised() -> None:
    settings = Settings(LOG_LEVEL="debug")  # type: ignore[call-arg]

    assert settings.log_level == "DEBUG"


def test_managed_postgres_url_names_the_installed_driver() -> None:
    """A host-supplied `postgresql://` must resolve to psycopg 3, not psycopg2.

    Left alone it does not raise here — it raises at connect time, where the
    lifespan swallows it and the service starts with no persistence at all.
    """
    from sqlalchemy import create_engine

    for raw in ("postgresql://u:p@host:5432/db", "postgres://u:p@host:5432/db"):
        settings = Settings(DATABASE_URL=raw)  # type: ignore[call-arg]

        assert settings.database_url.startswith("postgresql+psycopg://")
        # The real assertion: SQLAlchemy can find a driver for it.
        assert create_engine(settings.database_url).dialect.driver == "psycopg"


def test_sqlite_and_explicit_drivers_are_left_alone() -> None:
    for raw in ("sqlite:///./molthood.db", "postgresql+psycopg://u:p@host/db"):
        assert Settings(DATABASE_URL=raw).database_url == raw  # type: ignore[call-arg]


def test_docs_disabled_in_production() -> None:
    production = Settings(APP_ENV="production")  # type: ignore[call-arg]
    local = Settings(APP_ENV="local")  # type: ignore[call-arg]

    assert production.docs_url is None
    assert production.openapi_url is None
    assert local.docs_url == "/docs"


def test_every_table_compiles_for_postgresql() -> None:
    """The models are developed against SQLite and deployed against PostgreSQL.

    SQLite has no boolean type and accepts `DEFAULT 0` for one; PostgreSQL
    rejects the entire `CREATE TABLE` with "column is of type boolean but
    default expression is of type integer". That is what happened on the first
    real deployment — schema creation failed for *every* table, the process
    started anyway, and the service ran with no storage at all.

    Compiling the DDL catches the whole class without needing a live server.
    """
    from sqlalchemy.dialects import postgresql
    from sqlalchemy.schema import CreateTable

    # Imported for the side effect: a model absent from the registry is a
    # table this test would silently skip.
    from app.models import agent, auth, execution, project, report, watch  # noqa: F401
    from app.models.base import Base

    tables = Base.metadata.sorted_tables
    # Guards the test itself. Relying on an incidental import elsewhere would
    # let this pass while checking nothing.
    assert {"executions", "api_keys", "watches"} <= {t.name for t in tables}

    dialect = postgresql.dialect()

    for table in tables:
        ddl = str(CreateTable(table).compile(dialect=dialect))

        # An integer default on a boolean column is the specific rejection.
        for column in table.columns:
            if not isinstance(column.type, sqltypes.Boolean):
                continue
            if column.server_default is None:
                continue
            rendered = str(column.server_default.arg)  # type: ignore[union-attr]
            assert rendered.lower() in ("true", "false"), (
                f"{table.name}.{column.name} has server_default {rendered!r}. "
                "PostgreSQL needs a boolean literal here, not an integer — "
                "use sqlalchemy.false()/true(), not text('0')."
            )

        assert "CREATE TABLE" in ddl
