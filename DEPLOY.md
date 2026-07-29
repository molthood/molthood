# Deploying Molthood

Two services, two hosts:

| Piece            | Host    | Root directory | What it needs                    |
| ---------------- | ------- | -------------- | -------------------------------- |
| Console + site   | Vercel  | `/`            | one build-time variable          |
| FastAPI backend  | Railway | `/backend`     | a Postgres database and the keys |

They only meet in two places: the console's `NEXT_PUBLIC_API_URL` has to point
at the backend, and the backend's `CORS_ORIGINS` has to name the console. Get
those two wrong and everything else still starts — the console just cannot
reach anything.

---

## Before the first deploy

**Buy the domain first.** The code is set to `molthood.org`. If that ever
changes, these are the places that carry it — the first is the awkward one:

- `NEXT_PUBLIC_API_URL` is inlined into the JavaScript bundle at build time, so
  changing it means a **redeploy**, not a settings save.
- `src/config/site.ts` → `url` drives `metadataBase`, which every Open Graph
  image and canonical URL is resolved against.
- `WEB_USER_AGENT` is sent to every third-party site the platform reads, so
  operators can identify who is fetching them. It is also what the shared HTTP
  client announces — one value, not two.
- `app/services/openrouter.py` → the `http-referer` header, which is how
  OpenRouter attributes usage.
- `src/lib/validations/settings.ts` → an example address in a form placeholder.

Suggested split, and the rest of this document assumes it:

- `molthood.org` → Vercel
- `api.molthood.org` → Railway

---

## Railway — the backend

Set **root directory** to `backend`. `railway.json` supplies the rest: the
start command binds `0.0.0.0:$PORT`, and the health check is `/health`.

> `/health` and not `/api/health`. The first is a flat 200 whenever the process
> is serving. The second reports `degraded` when a provider has no key — and a
> platform health check reading *that* would restart a perfectly working
> service on every deploy, dropping live requests to fix nothing.

### 1. Attach Postgres before the first deploy

Add a Postgres database in the Railway project and reference it, which injects
`DATABASE_URL`. Do it **first**: without it the service still starts, still
answers health checks, and stores nothing — no history, no keys, no watchlist.

That silence is the reason `/api/health` now reports storage directly:

```json
"database": { "reachable": true, "dialect": "postgresql", "ephemeral": false }
```

Check it after the first deploy. `"dialect": "sqlite"` means Postgres was not
picked up and the container is writing to a file that dies with it.
`"reachable": false` names the exception.

Railway hands out `postgresql://…`, which SQLAlchemy reads as "use psycopg2" —
a package this project does not ship. The URL is rewritten to
`postgresql+psycopg://` on the way in, so paste it exactly as given.

### 2. Variables

Copy `backend/.env.example`, which documents all 81. These are the ones whose
value differs in production:

| Variable               | Production value                     | Why                                                             |
| ---------------------- | ------------------------------------ | --------------------------------------------------------------- |
| `APP_ENV`              | `production`                         | Disables `/docs`, `/redoc`, `/openapi.json`                     |
| `LOG_FORMAT`           | `json`                               | Railway parses structured logs; `console` is for humans          |
| `CORS_ORIGINS`         | `https://molthood.org,https://www.molthood.org` | Comma-separated. Omit and the console gets CORS errors |
| `TRUST_PROXY_HEADERS`  | `true`                               | **Only because Railway is a proxy** — see below                  |
| `WEB_USER_AGENT`       | `Molthood/0.6 (+https://molthood.org)` | Points at the real domain                                      |
| `QSTASH_CALLBACK_BASE_URL` | `https://api.molthood.org`       | QStash delivers by calling back; a laptop cannot receive         |
| `AUTH_REQUIRED`        | `true` *(already the default)*       | Leave it. Off means strangers spend your inference credit        |

`TRUST_PROXY_HEADERS` is worth understanding rather than copying.
`x-forwarded-for` is caller-supplied. On a directly-exposed service, trusting
it lets anyone reset their own rate limit by inventing a header. It is safe
here **only** because Railway's proxy overwrites it. Turn it off again the
moment the backend is reachable directly.

Then paste every provider key from `backend/.env`. All are optional — the
service starts with none of them and routes around what is absent — but each
missing one switches a capability off.

### 3. Grab the admin key from the first deploy's logs

On a database with no keys, startup mints one and logs it **once**:

```
bootstrap_admin_key_created  key=mlth_… note="Store this now. It is not recoverable."
```

Only a hash is stored. Miss it and the fix is a database row, so copy it out of
the deploy log before doing anything else.

### 4. Leave `MONITOR_ENABLED` off for now

It defaults to off deliberately: a monitor that started itself would begin
spending every existing key's quota the moment a version deployed. When you do
turn it on, keep `numReplicas` at 1 — the loop has no cross-process lock, so
two replicas run every check twice and bill the owner twice.

---

## Vercel — the console

Root directory `/`, framework auto-detected. One variable:

```
NEXT_PUBLIC_API_URL=https://api.molthood.org
```

Set it for **Production, Preview, and Development** before the first build. It
is compiled into the bundle, so a value added afterwards needs a redeploy — a
settings save alone changes nothing.

Preview deployments get a fresh `*.vercel.app` hostname each time, and none of
them are in `CORS_ORIGINS`. Previews of the console will not reach the API
unless you add the hostname. That is the correct default; a wildcard would let
any origin call the API with credentials.

---

## After both are up

1. `https://api.molthood.org/health` → `{"status":"ok"}`
2. `https://api.molthood.org/api/health` → check `database.dialect` is
   `postgresql` and `database.ephemeral` is `false`, then read `missing_keys`
   to confirm nothing you meant to set is listed
3. `https://api.molthood.org/docs` → **should 404.** If it renders, `APP_ENV`
   is not `production`
4. Open the console, paste the bootstrap key, run one analysis

---

## What is not covered

Honest gaps, so nothing here reads as more finished than it is:

- **No CI.** Tests run locally (`ruff`, `mypy`, `pytest`) and nothing enforces
  them on push.
- **Alembic is configured but has no revisions.** `create_schema()` adds
  missing tables and columns at startup, which covers additive changes. A
  rename, a type change, or a backfill needs a real migration written first.
- **QStash delivery is untested end to end.** It cannot be, without a public
  callback URL. First real test is after this deploy.
- **The rate limiter is per-process.** It protects one instance from a burst;
  it is not a global limit. Spend is capped in the database, which is the part
  that actually guards money.
- **No error tracking.** PostHog collects product analytics, not exceptions.
