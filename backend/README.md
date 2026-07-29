# Molthood Backend

FastAPI service behind **Molthood**, the AI execution platform for Robinhood Chain.

> **Phase 4 — Live Data Integration & AI Execution Core.**
> The service reads **live Robinhood Chain mainnet data** (chain id 4663) and
> runs real multi-agent analyses over it.
>
> | Integration      | State                                                    |
> | ---------------- | -------------------------------------------------------- |
> | Robinhood RPC    | **Live** — public mainnet, no key required                |
> | Blockscout       | **Live** — public explorer, no key required               |
> | OpenRouter       | Implemented, needs `OPENROUTER_API_KEY`                   |
> | Codex            | Implemented, needs `CODEX_API_KEY`                        |
>
> Without `OPENROUTER_API_KEY` an execution still returns complete, real
> evidence; the summary stage reports `not_configured` rather than inventing
> prose. Nothing is ever fabricated to fill a gap.
>
> Still out of scope: authentication, persistence, background workers,
> notifications, and any transaction signing. This service is **read-only**.

## Requirements

Python 3.12+ and outbound HTTPS. PostgreSQL and Redis are **configured but
never contacted** — the service boots and serves fully with neither installed.

## Getting started

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux

pip install -r requirements-dev.txt
cp .env.example .env

uvicorn app.main:app --reload
```

- API: <http://127.0.0.1:8000>
- Docs: <http://127.0.0.1:8000/docs>
- OpenAPI: <http://127.0.0.1:8000/openapi.json>

## Endpoints

| Method | Path                          | Description                                |
| ------ | ----------------------------- | ------------------------------------------ |
| GET    | `/health`                     | Liveness probe (unversioned, on purpose)   |
| GET    | `/version`                    | Build and environment information          |
| POST   | `/api/v1/execute`             | Run a free-form request through the engine |
| GET    | `/api/v1/token/{address}`     | Analyze a token                            |
| GET    | `/api/v1/wallet/{address}`    | Analyze a wallet                           |
| GET    | `/api/v1/contract/{address}`  | Analyze a contract                         |
| GET    | `/api/v1/project`             | Chain-level overview                       |
| GET    | `/api/v1/chain/stats`         | Live network figures for dashboards        |
| GET    | `/api/v1/chain/tokens`        | Tracked tokens on the chain                |
| GET    | `/api/v1/status`              | Component and dependency readiness         |
| GET    | `/api/v1/agents`              | Live agent registry                        |
| GET    | `/api/v1/executions`          | Runs performed by this process             |
| GET    | `/api/v1/pipelines`           | Registered pipelines and stage order       |

Every analysis returns the same object: `execution_id`, `status`, `summary`,
`evidence`, `sources`, `facts`, `agents_used`, `services_called`, `stages`,
and `execution_time_ms`.

Errors always return
`{ error: { code, message, suggested_action, details }, request_id }` —
never a stack trace.

## Architecture

```
app/
  api/          HTTP layer — deps, system routes, v1 router + endpoints
  agents/       BaseAgent contract, registry, and 8 agent packages
  engine/       ExecutionEngine, ExecutionContext, Task, results
  pipelines/    Stage contract, the five stages, StandardPipeline, registry
  services/     Outbound clients (Robinhood RPC, Blockscout, Codex, OpenRouter)
  repositories/ Repository protocol + in-memory fixtures
  models/       SQLAlchemy models and domain enums
  schemas/      Pydantic v2 request/response contracts
  core/         Exceptions, error handlers, lifespan, database wiring
  config/       Settings loaded from .env
  logging/      structlog setup and request contextvars
  middleware/   Request id, timing, access log, CORS
  tasks/        Task queue contract (no broker, no worker)
  utils/        ids, time, pagination
```

### Execution flow

```
Request → Router → Service Layer → Evidence → AI Summary → Result
```

Mapped onto the five `PipelineStage` values: `input`, `agents` (routing),
`engine` (service calls), `evidence`, `report` (summary).

**The router decides everything.** No workflow is hardcoded in a route. Given
free-form text it looks for an explicit target, then a keyword, and finally —
for a bare address with no noun — it asks the chain whether the address is a
contract, a token, or an EOA, and routes accordingly.

**Agents call services in parallel.** `asyncio.gather` inside each agent means
a token analysis issues its three explorer reads at once. The Risk Agent runs
last and calls nothing: it scores from evidence the others collected, so every
point of the score traces to a specific observation.

**Evidence is separate from the summary.** Evidence comes from a service call
and carries a `source_url` you can open. The summary is model output, labelled
as such, and the model is instructed to use only the supplied facts.

### Implemented agents

| Agent    | Target             | Services                    |
| -------- | ------------------ | --------------------------- |
| Market   | token              | Blockscout (+ Codex if set) |
| Contract | contract           | Blockscout, RPC             |
| Project  | wallet, chain      | Blockscout, RPC             |
| Risk     | scores every above | none — reads evidence       |

Launch, Builder, Portfolio, and Community remain registered but unimplemented,
and report `implemented: false` rather than pretending otherwise.

## Logging

structlog, routed through the standard library so application and uvicorn logs
share one handler. Every line carries `timestamp`, `level`, `logger`,
`request_id`, and `route`; the access line adds `duration_ms` and `status_code`.

Set `LOG_FORMAT=json` for line-delimited JSON, `console` for local reading.
Responses carry `X-Request-ID` and `X-Response-Time-Ms`; an inbound
`X-Request-ID` is preserved so a trace survives across hops.

## Configuration

All settings load from `.env` — see [`.env.example`](.env.example) for the full
list with defaults. Notable: `CORS_ORIGINS` is comma-separated (not JSON).

## Database

Models are complete and registered on `Base.metadata`, and Alembic is
scaffolded, but **no migration has been generated** — there is nothing to
migrate against yet. See [`alembic/README.md`](alembic/README.md).

## Development

```bash
pytest              # 33 tests
ruff check .        # lint
ruff format .       # format
mypy app            # strict type check
```

## Explicitly out of scope in this phase

Authentication · database persistence · AI inference · outbound API requests ·
blockchain transactions · background workers.
