"""Application settings, loaded once from the environment."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

Environment = Literal["local", "development", "staging", "production"]
LogFormat = Literal["json", "console"]


class Settings(BaseSettings):
    """Every value the application reads from the environment.

    Nothing here connects to anything. Credentials and URLs are collected so
    that Phase 4 can wire real clients without touching call sites.
    """

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Application ---
    app_name: str = Field(default="Molthood API", alias="APP_NAME")
    app_env: Environment = Field(default="local", alias="APP_ENV")
    app_version: str = Field(default="0.3.0", alias="APP_VERSION")
    api_prefix: str = Field(default="/api/v1", alias="API_PREFIX")
    debug: bool = Field(default=False, alias="DEBUG")

    # --- Networking ---
    host: str = Field(default="127.0.0.1", alias="HOST")
    port: int = Field(default=8000, alias="PORT")
    # `NoDecode` suppresses pydantic-settings' automatic JSON decoding of
    # complex types, so `_split_origins` can accept a plain comma-separated
    # string from `.env` instead of requiring a JSON array.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default=["http://localhost:3000", "http://127.0.0.1:3000"],
        alias="CORS_ORIGINS",
    )

    # --- Logging ---
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    log_format: LogFormat = Field(default="console", alias="LOG_FORMAT")

    # --- Persistence ---
    #: SQLite by default so history survives a restart on a machine with no
    #: database installed. It is a real database, not a stand-in: the ORM
    #: models are unchanged, and pointing this at PostgreSQL is a one-line
    #: change with no code to touch.
    database_url: str = Field(default="sqlite:///./molthood.db", alias="DATABASE_URL")
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")

    #: How long a stored analysis is served instead of being re-run. Repeating
    #: an analysis costs several seconds and real OpenRouter credit, and the
    #: chain does not move meaningfully within this window.
    analysis_cache_seconds: int = Field(default=600, ge=0, alias="ANALYSIS_CACHE_SECONDS")

    #: How many token positions a wallet analysis screens. Each one costs four
    #: explorer reads, so an unbounded wallet would issue hundreds of requests
    #: and be rate-limited into returning nothing. Positions past the cap are
    #: named in the report rather than dropped silently.
    portfolio_max_holdings: int = Field(
        default=8, ge=1, le=50, alias="PORTFOLIO_MAX_HOLDINGS"
    )

    #: How far back change detection will look for the previous analysis of the
    #: same subject. Beyond this the comparison is archaeology rather than news,
    #: and "the price moved" over three months is not a finding.
    change_lookback_days: int = Field(default=30, ge=0, alias="CHANGE_LOOKBACK_DAYS")

    # --- Background monitoring ---
    #: Off by default. A monitor that starts itself would begin spending every
    #: existing key's quota the moment this version is deployed, which is not a
    #: decision a version bump should make on an operator's behalf.
    monitor_enabled: bool = Field(default=False, alias="MONITOR_ENABLED")

    #: How often the monitor wakes. It only checks what is *due*, so this is
    #: the resolution of the schedule rather than how often anything runs.
    monitor_tick_seconds: int = Field(default=60, ge=10, alias="MONITOR_TICK_SECONDS")
    #: Checks per tick. Bounded so a large watchlist cannot monopolise the
    #: explorer's rate limit against the requests people are waiting on.
    monitor_batch_size: int = Field(default=5, ge=1, le=50, alias="MONITOR_BATCH_SIZE")

    #: Floor on how often one watch may run. Each check costs the owner a unit
    #: of their daily allowance, so a one-minute interval would spend fifty of
    #: them before lunch.
    watch_min_interval_seconds: int = Field(
        default=900, ge=60, alias="WATCH_MIN_INTERVAL_SECONDS"
    )
    watch_default_interval_seconds: int = Field(
        default=3600, ge=60, alias="WATCH_DEFAULT_INTERVAL_SECONDS"
    )

    # --- Authentication and limits ---
    #: When false, analysis routes are open. Kept switchable so a local
    #: developer is not forced through a key to try the thing, but it defaults
    #: to on: an open deployment lets a stranger spend this project's inference
    #: credit without limit, and defaulting to convenience would make that the
    #: accident rather than the decision.
    auth_required: bool = Field(default=True, alias="AUTH_REQUIRED")

    #: Analyses per UTC day for a self-serve key. Each one costs real credit —
    #: roughly a cent — so this is a money decision, not a capacity one.
    default_daily_quota: int = Field(default=50, ge=0, alias="DEFAULT_DAILY_QUOTA")
    admin_daily_quota: int = Field(default=1000, ge=0, alias="ADMIN_DAILY_QUOTA")

    #: Keys one address may mint per day. Without this, self-serve signup is
    #: just a slower way to get unlimited quota.
    signup_keys_per_ip_per_day: int = Field(
        default=3, ge=0, alias="SIGNUP_KEYS_PER_IP_PER_DAY"
    )

    rate_limit_enabled: bool = Field(default=True, alias="RATE_LIMIT_ENABLED")
    rate_limit_requests: int = Field(default=60, ge=1, alias="RATE_LIMIT_REQUESTS")
    rate_limit_window_seconds: int = Field(
        default=60, ge=1, alias="RATE_LIMIT_WINDOW_SECONDS"
    )

    #: Only enable behind a proxy that overwrites `x-forwarded-for`. The header
    #: is caller-supplied, so trusting it on a directly-exposed service lets
    #: anyone reset their own rate limit by inventing one.
    trust_proxy_headers: bool = Field(default=False, alias="TRUST_PROXY_HEADERS")

    # --- Capability providers ---
    #
    # Every one is optional. A missing key makes that provider unavailable and
    # nothing else: the application starts, the console says which variable
    # would enable it, and the router routes around it. Adding a key and
    # restarting is the only step needed to bring one into rotation.
    #
    # The master switch exists for one case — turning the whole layer off to
    # isolate a problem without unsetting eight variables.
    providers_enabled: bool = Field(default=True, alias="PROVIDERS_ENABLED")

    #: Search by meaning, similar pages, page contents.
    exa_base_url: str = Field(default="https://api.exa.ai", alias="EXA_BASE_URL")
    exa_api_key: SecretStr | None = Field(default=None, alias="EXA_API_KEY")

    #: Answer-shaped search, plus the only news-ordered source in the layer.
    tavily_base_url: str = Field(
        default="https://api.tavily.com", alias="TAVILY_BASE_URL"
    )
    tavily_api_key: SecretStr | None = Field(default=None, alias="TAVILY_API_KEY")

    #: Reader works anonymously; a key only raises the rate limit. That is why
    #: it is the fallback that keeps a keyless deployment able to read a page.
    jina_reader_url: str = Field(default="https://r.jina.ai", alias="JINA_READER_URL")
    jina_api_key: SecretStr | None = Field(default=None, alias="JINA_API_KEY")

    #: Browser-rendered scraping, crawling, extraction, screenshots.
    firecrawl_base_url: str = Field(
        default="https://api.firecrawl.dev", alias="FIRECRAWL_BASE_URL"
    )
    firecrawl_api_key: SecretStr | None = Field(default=None, alias="FIRECRAWL_API_KEY")

    #: Sandboxed code execution. Also needs the `e2b-code-interpreter` package,
    #: which is optional — a deployment that never runs code need not install it.
    e2b_api_key: SecretStr | None = Field(default=None, alias="E2B_API_KEY")
    e2b_template: str = Field(default="", alias="E2B_TEMPLATE")

    #: Shared cache. Without both halves the cache falls back to memory, which
    #: is per-process and lost on restart — correct, but not shared.
    upstash_redis_rest_url: str = Field(default="", alias="UPSTASH_REDIS_REST_URL")
    upstash_redis_rest_token: SecretStr | None = Field(
        default=None, alias="UPSTASH_REDIS_REST_TOKEN"
    )

    #: Deferred work. QStash delivers by calling a public URL back, so the
    #: callback base is as necessary as the token — a laptop cannot receive
    #: deliveries however valid its credentials are.
    qstash_base_url: str = Field(
        default="https://qstash.upstash.io", alias="QSTASH_BASE_URL"
    )
    qstash_token: SecretStr | None = Field(default=None, alias="QSTASH_TOKEN")
    qstash_callback_base_url: str = Field(default="", alias="QSTASH_CALLBACK_BASE_URL")
    #: Signing keys for *incoming* deliveries. Publishing and receiving use
    #: different credentials: the token authorises us to QStash, these prove a
    #: delivery came from QStash. Two of them so a key rotation does not drop
    #: messages already in flight.
    qstash_current_signing_key: SecretStr | None = Field(
        default=None, alias="QSTASH_CURRENT_SIGNING_KEY"
    )
    qstash_next_signing_key: SecretStr | None = Field(
        default=None, alias="QSTASH_NEXT_SIGNING_KEY"
    )

    #: Error tracking. Optional: with no DSN the SDK is never initialised and
    #: nothing changes. Events are scrubbed before sending — see
    #: `core/monitoring.py`.
    sentry_dsn: SecretStr | None = Field(default=None, alias="SENTRY_DSN")

    #: Product analytics. Never affects a request; failures are swallowed.
    posthog_host: str = Field(default="https://us.i.posthog.com", alias="POSTHOG_HOST")
    posthog_api_key: SecretStr | None = Field(default=None, alias="POSTHOG_API_KEY")
    analytics_enabled: bool = Field(default=True, alias="ANALYTICS_ENABLED")

    # --- Robinhood Chain (public mainnet, chain id 4663 — no API key needed) ---
    chain_id: int = Field(default=4663, alias="CHAIN_ID")
    chain_name: str = Field(default="Robinhood Chain", alias="CHAIN_NAME")
    robinhood_rpc_url: str = Field(
        default="https://rpc.mainnet.chain.robinhood.com", alias="ROBINHOOD_RPC_URL"
    )
    blockscout_base_url: str = Field(
        default="https://robinhoodchain.blockscout.com", alias="BLOCKSCOUT_BASE_URL"
    )

    # --- Credentialed services ---
    openrouter_base_url: str = Field(
        default="https://openrouter.ai/api/v1", alias="OPENROUTER_BASE_URL"
    )
    #: Claude 3.5 Sonnet was retired in Oct 2025 — do not use it as a default.
    openrouter_model: str = Field(
        default="anthropic/claude-sonnet-5", alias="OPENROUTER_MODEL"
    )
    codex_base_url: str = Field(default="https://graph.codex.io", alias="CODEX_BASE_URL")

    openrouter_api_key: SecretStr | None = Field(default=None, alias="OPENROUTER_API_KEY")
    codex_api_key: SecretStr | None = Field(default=None, alias="CODEX_API_KEY")

    #: GoPlus signs each token exchange, so both halves are required; either
    #: alone is as good as neither. Anonymous access works without them and is
    #: throttled after roughly ten requests.
    goplus_app_key: SecretStr | None = Field(default=None, alias="GOPLUS_APP_KEY")
    goplus_app_secret: SecretStr | None = Field(default=None, alias="GOPLUS_APP_SECRET")

    # --- Web intelligence: official public endpoints ---
    #: Microlink's public tier needs no key; OpenGraph does. They answer the
    #: same question, so OpenGraph is a corroborating second source rather
    #: than a dependency — an analysis is complete without it.
    microlink_base_url: str = Field(
        default="https://api.microlink.io", alias="MICROLINK_BASE_URL"
    )
    opengraph_base_url: str = Field(
        default="https://opengraph.io/api/1.1", alias="OPENGRAPH_BASE_URL"
    )
    opengraph_api_key: SecretStr | None = Field(default=None, alias="OPENGRAPH_API_KEY")
    #: Cloudflare requires `accept: application/dns-json`; Google's /resolve does not.
    doh_base_url: str = Field(
        default="https://cloudflare-dns.com/dns-query", alias="DOH_BASE_URL"
    )
    #: IANA's registry maps a TLD to its authoritative RDAP server. Resolving
    #: through it keeps every lookup first-party instead of via a redirector.
    rdap_bootstrap_url: str = Field(
        default="https://data.iana.org/rdap/dns.json", alias="RDAP_BOOTSTRAP_URL"
    )
    crtsh_base_url: str = Field(default="https://crt.sh", alias="CRTSH_BASE_URL")
    #: Reverse index for four-byte function selectors. No key, no account. It
    #: is what lets an unverified contract still be scanned for owner powers.
    openchain_base_url: str = Field(
        default="https://api.openchain.xyz", alias="OPENCHAIN_BASE_URL"
    )
    wayback_availability_url: str = Field(
        default="https://archive.org/wayback/available",
        alias="WAYBACK_AVAILABILITY_URL",
    )
    wayback_cdx_url: str = Field(
        default="https://web.archive.org/cdx/search/cdx", alias="WAYBACK_CDX_URL"
    )
    github_api_base_url: str = Field(
        default="https://api.github.com", alias="GITHUB_API_BASE_URL"
    )
    github_raw_base_url: str = Field(
        default="https://raw.githubusercontent.com", alias="GITHUB_RAW_BASE_URL"
    )
    github_token: SecretStr | None = Field(default=None, alias="GITHUB_TOKEN")

    # --- Fetching arbitrary third-party sites ---
    #: Sent on every outbound request so site operators can identify and contact us.
    web_user_agent: str = Field(
        default="Molthood/0.6 (+https://molthood.org)", alias="WEB_USER_AGENT"
    )
    web_fetch_timeout_seconds: float = Field(
        default=15.0, gt=0, alias="WEB_FETCH_TIMEOUT_SECONDS"
    )
    #: Hard ceiling on a downloaded body — an arbitrary URL may point at a
    #: multi-gigabyte file, and we must not stream it into memory.
    web_fetch_max_bytes: int = Field(default=5_000_000, gt=0, alias="WEB_FETCH_MAX_BYTES")
    #: crt.sh routinely takes 30s+; it needs a budget of its own or it would
    #: consume the entire execution timeout.
    crtsh_timeout_seconds: float = Field(
        default=45.0, gt=0, alias="CRTSH_TIMEOUT_SECONDS"
    )

    # --- Outbound resilience ---
    http_max_attempts: int = Field(default=3, ge=1, le=8, alias="HTTP_MAX_ATTEMPTS")
    http_connect_timeout: float = Field(default=5.0, gt=0, alias="HTTP_CONNECT_TIMEOUT")
    http_read_timeout: float = Field(default=15.0, gt=0, alias="HTTP_READ_TIMEOUT")

    # --- Engine limits ---
    max_concurrent_executions: int = Field(
        default=8, ge=1, le=64, alias="MAX_CONCURRENT_EXECUTIONS"
    )
    execution_timeout_seconds: int = Field(
        default=60, ge=1, alias="EXECUTION_TIMEOUT_SECONDS"
    )

    @field_validator("database_url", mode="before")
    @classmethod
    def _name_the_postgres_driver(cls, value: object) -> object:
        """Point a bare `postgresql://` URL at the driver actually installed.

        Managed hosts hand out `postgresql://…`, and SQLAlchemy reads that as
        "use psycopg2" — a package this project does not ship. It ships
        psycopg 3, so the URL has to say so.

        This matters more than it looks. The failure is not a crash: startup
        catches it, logs `database_unavailable`, and the service comes up
        *without persistence*, answering health checks while discarding every
        execution. A deployment that looks fine and stores nothing is the exact
        outcome this codebase is written to prevent.
        """
        if isinstance(value, str):
            for prefix in ("postgresql://", "postgres://"):
                if value.startswith(prefix):
                    return f"postgresql+psycopg://{value[len(prefix) :]}"
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        """Accept a comma-separated string so `.env` stays readable."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("log_level", mode="before")
    @classmethod
    def _normalise_level(cls, value: object) -> object:
        if isinstance(value, str):
            return value.upper()
        return value

    @field_validator(
        "openrouter_api_key",
        "codex_api_key",
        "github_token",
        "opengraph_api_key",
        "goplus_app_key",
        "goplus_app_secret",
        "exa_api_key",
        "tavily_api_key",
        "jina_api_key",
        "firecrawl_api_key",
        "e2b_api_key",
        "upstash_redis_rest_token",
        "qstash_token",
        "qstash_current_signing_key",
        "qstash_next_signing_key",
        "posthog_api_key",
        "sentry_dsn",
        mode="before",
    )
    @classmethod
    def _blank_secret_is_unset(cls, value: object) -> object:
        """Treat `KEY=` in `.env` as absent rather than as an empty secret.

        Without this, an unset key reads as configured and `/api/v1/status`
        would report a service as ready when it has no credential at all.
        """
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def docs_url(self) -> str | None:
        """Interactive docs are disabled in production."""
        return None if self.is_production else "/docs"

    @property
    def redoc_url(self) -> str | None:
        return None if self.is_production else "/redoc"

    @property
    def openapi_url(self) -> str | None:
        return None if self.is_production else "/openapi.json"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached accessor — settings are read from the environment exactly once."""
    return Settings()
