# Molthood — codebase guide

AI execution platform built exclusively for Robinhood Chain.

Two apps live here:

| Path         | What it is                | Guide                                  |
| ------------ | ------------------------- | -------------------------------------- |
| `/` (`src/`) | Next.js 15 console + site | this file                              |
| `/backend`   | FastAPI service           | [backend/README.md](backend/README.md) |

**The console reads live Robinhood Chain data through the backend.** Run both:

```bash
cd backend && uvicorn app.main:app     # http://127.0.0.1:8000
npm run dev                            # http://localhost:3000
```

`NEXT_PUBLIC_API_URL` in `.env.local` points the console at the API.

Going live is [DEPLOY.md](DEPLOY.md) — console on Vercel, backend on Railway,
and the handful of settings whose value differs in production.

## The honesty rule

The console shows real chain data, so **nothing beside it may be invented**.
When a surface has no live source it says so; it never falls back to plausible
placeholder numbers. This is why `src/data/` holds only `workspace.ts` (UI
chrome), why `/console/projects` renders an empty state, and why an execution
without `OPENROUTER_API_KEY` reports `summary_status: not_configured` instead
of generating text. Keep this rule when extending either app.

Its sharpest form is the three-state evidence model (`EvidenceState`): a
finding is `confirmed`, `refuted`, or `unknown`, and **a check that could not
run must never render as a check that came back clean**. Every feature added
since inherits this — a portfolio screen missing a check reports its score as
a ceiling, and a comparison with nothing to compare against returns `None`
rather than "no changes".

The same rule applies to *upstream nulls*, which is where it keeps breaking.
Blockscout returns HTTP 200 with `is_verified: null` for an unverified
contract; reading that as "unknown" produced no finding at all, and an
unverified token scored identically to a verified one. When a source answers
successfully with an empty field, decide what the emptiness means — do not let
it fall through.

## Two integration layers, and why

`backend/app/services/` and `backend/app/providers/` look alike and are not
interchangeable. The difference decides where new code goes:

- A **service** is a named dependency with a shape only it has. Blockscout
  returns token records; nothing else does. Callers name the service.
- A **provider** is *interchangeable*. Four of them answer `WEB_SEARCH`, and
  the caller names the **capability** — the manager picks who serves it.

That is why providers declare `capabilities` rather than methods, why
`execute()` takes a capability, and why a provider that cannot serve a request
returns `ProviderResult(ok=False)` instead of raising. A router driving four
providers must lose one to a missing key, not lose the run.

Both layers share `services/http.py`, so retries, timeouts, backoff, and error
translation behave identically. Nothing is reimplemented.

**The rule that governs the provider layer: the application is fully
functional with zero credentials.** It starts, `/api/health` names every
variable that would enable something, and the router routes around what is
absent. Adding a key and restarting is the only enablement step — there is no
code path that a new key changes.

Two consequences worth knowing before editing:

- `ProviderState` has six values, not a boolean. `missing_key` is a deployment
  task, `rate_limited` clears on its own, `unavailable` is an upstream outage.
  Collapsing them repeats the mistake the evidence model exists to prevent.
- **Routing policy is data**, in `providers/manager.PREFERENCE`. Order encodes
  cost as well as ability — Jina reads a page for free, so it precedes
  Firecrawl, which renders in a browser and bills for it. Adding a provider is
  one entry there; adding a workflow is one entry in `providers/workflows.py`.

**One task in, one report out** is `providers/orchestrator.py`, behind
`POST /api/v1/tasks`. It classifies the request, resolves the workflow against
what exists, runs the independent steps together and the dependent ones after,
and assembles a `Report`. Four properties are load-bearing and each has a test:
a skipped step appears in the timeline with its reason; a failing step does not
fail the task; `confidence` is derived from what actually ran and is `unknown`
rather than `low` when nothing was established; and identical concurrent
requests share one execution through an in-flight map.

`/api/health` is deliberately separate from `/health`. The latter is a liveness
probe and stays a flat 200: a process reporting `degraded` because a provider
has no key would be restarted by an orchestrator, which fixes nothing and drops
live requests.

## Monitoring

A single analysis is a photograph. `engine/monitor.py` runs a plain asyncio
loop that asks `repositories/watches.py` what is due and re-runs it, which
produces a change report because the diff already runs inside every execution.

Three constraints, all load-bearing:

- **`MONITOR_ENABLED` is off by default.** A monitor that started itself would
  begin spending every existing key's quota the moment a new version deployed.
- **A check spends the owner's quota**, exactly as a manual run does, and is
  refused the same way when the allowance is gone. Each tick takes a shared
  lock first, so two replicas cannot both find the same watch due and bill
  the owner twice for one result — without a shared cache the lock is
  refused rather than faked, and the tick runs anyway because a single
  process has nothing to race with.
- **A monitored run passes `summarize=False`.** The AI summary is over half the
  wall time and the diff is the product; hourly prose about an unmoved token
  is pure cost.

A failed check still records `last_checked_at`, or the watch stays permanently
due and retries in a tight loop against whatever is already broken. The reason
is stored in `last_error` so the console can say why a watch went quiet rather
than showing a stale timestamp that reads as "all clear".

## Authentication

Analyses cost real inference credit — roughly a cent each — so they require an
API key and are metered. Two mechanisms, deliberately separate:

- **`middleware/rate_limit.py` caps pace.** In-process, per-process, and lost
  on restart, which is fine: it protects the server from a burst.
- **`repositories/api_keys.py` caps spend.** In the database, because it
  guards money and must hold across restarts and workers. The increment is a
  single guarded `UPDATE`, never a read-then-write — the latter is safe only
  because SQLite serialises writers and silently overspends on PostgreSQL.

Every execution records the key that ran it, and history, permalinks, the
cache, and change detection are all scoped to it. A wallet analysis records
the address someone asked about; publishing that on a shared list is not an
acceptable default.

## Stack

Next.js 15 (App Router) · TypeScript (strict) · Tailwind CSS v4 · Framer Motion ·
Lucide · Geist + Inter + JetBrains Mono · React Hook Form · Zod

## Layout

```
src/
  app/
    (site)/          public surface — shares Navbar + Footer via layout
      page.tsx       landing
      docs/          documentation — [...slug] renders every page from config
    console/         application shell — own layout, sidebar + topbar
    globals.css      design tokens (@theme) + base layer
    not-found.tsx
  components/
    ui/              button, badge, card, input, field, switch, search-input,
                     table, tabs, modal, drawer, dropdown, tooltip, toast,
                     skeleton, loading-state, avatar, kbd, code-block
    layout/          container, section, grid, heading, navbar, footer
    console/         shell, sidebar, topbar, breadcrumbs, command palette,
                     notifications, user menu, stat/agent/project/report cards,
                     timeline, per-page *-view clients
    marketing/       hero, pipeline, agent cards, section blocks
    motion/          Reveal / Stagger / HoverLift + shared motion presets
    brand/           logo mark
  config/            site, agents, pipeline, console — marketing content
  config/docs/       every documentation page, as data rather than JSX
  data/workspace.ts  console chrome identity only (no auth yet, no metrics)
  types/console.ts   domain types for the marketing surface
  hooks/             use-api (fetch + loading + error), use-live-analysis (SSE),
                     use-scrolled, use-media-query
  lib/api/           typed backend client, SSE stream reader, response types
  lib/               utils (cn), fonts, format, status, validations/
```

Console pages are server components that render a `*-live.tsx` client, which
fetches through `lib/api/client.ts` with `useApi`. Every fetch surface must
handle three states: skeleton, `ErrorState`, and data. Raw JSON is never shown —
`formatEvidenceValue` renders arbitrary values as text.

Running an analysis goes through `lib/api/stream.ts` instead, which reads
`GET /api/v1/stream` as server-sent events. The evidence is complete about a
third of the way into a run, so the report renders there and the summary types
in after it — the work takes just as long, but the finished parts stop waiting
on the slow one. Free-form requests still use the plain `POST /execute`,
because the router has to read the text before it knows the target.

## Conventions

- **Content lives in `src/config/`**, never inline in a page. Adding an agent, an
  endpoint, or a nav item means editing config, not JSX.
- **Spacing and width come from `Section` and `Container`.** Do not hardcode
  `py-*` or `max-w-*` on a page.
- **Colors are tokens only** — `bg-background`, `bg-surface`, `border-border`,
  `text-primary`, `text-muted`. No raw hex outside `globals.css`.
- **Motion goes through `Reveal` / `Stagger`** with presets from
  `components/motion/motion-presets.ts`. Use `immediate` for above-the-fold content
  so it does not wait on a viewport intersection.
- `"use client"` only where state, effects, or Framer Motion require it. Console
  pages stay server components and delegate interactivity to a `*-view.tsx` client.
- Every component takes `className` and merges it with `cn()`.
- **Never call `Date.now()` in a render path.** All timestamps are derived from
  `REFERENCE_NOW` in `lib/format.ts`; a live clock desynchronises server and
  client output and breaks hydration.
- Status label + colour live together in `lib/status.ts`. Never map a status to a
  badge variant inline.
- Data belongs in `src/data/`, never inside a component. Phase 3 replaces those
  modules with real fetches; nothing else should need to change.
- **Scoring rules live in `backend/app/agents/risk/signals.py`,** as pure
  functions over a facts dict. The Risk Agent and the Portfolio Agent both call
  them, so a token screened inside a wallet is judged exactly as one analysed
  on its own. Never write a second copy of a rule for a new surface.
- **The console never builds an explorer URL.** Links come from the backend as
  `source_url` or an equivalent field, so the frontend has no opinion about
  which explorer this chain uses.
- **`create_schema()` adds missing tables *and* missing columns.** There are no
  Alembic revisions yet, and `create_all` will not touch a table that already
  exists — adding a column without this left eight live rows behind a model
  they no longer matched. Additive changes only; a rename or a backfill still
  needs a real migration.

## Commands

```bash
npm run dev        # localhost:3000
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```
