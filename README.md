<div align="center">

![Molthood](.github/banner.png)

**An AI execution platform for Robinhood Chain.**

You describe a subject — a token, a wallet, a contract, a website — and agents
gather evidence about it from independent sources, then report what they found
*and what they could not check*.

[molthood.org](https://molthood.org) ·
[Ask Molthood Agent](https://molthood.org/askmoltagent) ·
[Console](https://console.molthood.org) ·
[Documentation](https://docs.molthood.org) ·
[Roadmap](https://docs.molthood.org/roadmap)

</div>

---

## The rule everything is built around

Most on-chain tooling will tell you a token is safe. Almost none of it
distinguishes between **checked and clean** and **not checked at all** — and
those two produce identical-looking green ticks.

That is not a small omission. It inverts the meaning of the result. A scanner
that could not reach the contract source, could not read the liquidity and
could not resolve ownership will happily show a page with no warnings on it,
and no warnings reads as good news.

> **A check that could not run must never render as a check that came back
> clean.**

Every finding is `confirmed`, `refuted`, or `unknown`. There is no fourth
state, and `unknown` is never rounded down to nothing. A risk score computed
while a check was unavailable is reported as a **ceiling** rather than a
number. A comparison with nothing to compare against returns nothing rather
than "no changes". A surface with no live source says so instead of showing a
plausible placeholder.

## What is here

| Surface | What it is | Where |
| --- | --- | --- |
| **Molthood Agent** | Conversational access to the whole engine. Routes its own tools, cites its sources, generates files. | [molthood.org/askmoltagent](https://molthood.org/askmoltagent) |
| **Console** | Run an analysis, watch it stream, compare subjects, keep a history. | [console.molthood.org](https://console.molthood.org) |
| **Documentation** | Architecture, concepts, guides, API reference, roadmap. | [docs.molthood.org](https://docs.molthood.org) |
| **Developer platform** | Keys, public API, SDK, CLI, webhooks. *Under development.* | [status](https://docs.molthood.org/platform/dashboard) |

## Repository layout

Two applications, one repository.

```
.
├── src/                  Next.js 15 — marketing site, docs, console, agent
│   ├── app/              App Router; one app serves four hosts
│   ├── components/       ui · layout · console · marketing · ai · docs
│   ├── config/           content as data — docs, roadmap, agents, models
│   └── lib/ai/           the agent: intent, tools, providers, artifacts
└── backend/              FastAPI — the analysis engine
    └── app/
        ├── agents/       market · risk · research · portfolio
        ├── engine/       pipeline, evidence, scoring, change detection
        ├── providers/    interchangeable capabilities behind one router
        └── services/     named dependencies (explorer, node, screening)
```

Both apps have a guide written to be read *before* changing anything:
[`AGENTS.md`](AGENTS.md) for the frontend and the shared rules,
[`backend/README.md`](backend/README.md) for the engine. They explain why
things are the way they are, rather than restating what the code already says.

## Running it

```bash
# engine — http://127.0.0.1:8000
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload

# web — http://localhost:3000
npm install && npm run dev
```

`NEXT_PUBLIC_API_URL` in `.env.local` points the web app at the engine. Copy
[`.env.example`](.env.example) and
[`backend/.env.example`](backend/.env.example) to start.

**The application is fully functional with zero credentials.** It starts,
`/api/health` names every variable that would enable something, and the router
routes around whatever is absent. Adding a key and restarting is the only
enablement step — there is no code path that a new key switches on.

## Commands

| | Frontend | Backend |
| --- | --- | --- |
| Develop | `npm run dev` | `uvicorn app.main:app --reload` |
| Types | `npm run typecheck` | `mypy app` |
| Lint | `npm run lint` | `ruff check app tests` |
| Format | — | `ruff format app tests` |
| Test | — | `pytest` |
| Build | `npm run build` | — |

CI runs all of it on every push and pull request. Both hosts deploy from `main`
automatically, so a red gate is the only thing standing between a bad commit
and production.

## Stack

**Frontend** — Next.js 15 (App Router) · TypeScript (strict) · Tailwind CSS v4
· Framer Motion · Zod

**Backend** — FastAPI · Pydantic v2 · SQLAlchemy 2 · structlog · httpx ·
PostgreSQL

**Agent** — multi-provider routing across Anthropic, OpenAI, Google and
DeepSeek. A model declares an ordered list of routes and the first healthy one
answers, so a provider running out of quota costs you that provider rather than
the conversation.

## Contributing

[`CONTRIBUTING.md`](CONTRIBUTING.md) covers the workflow. The short version:
read the guide for the area you are touching, keep the evidence model intact,
and add a test for anything that could silently become wrong.

Security issues go to [`SECURITY.md`](SECURITY.md) — privately, please, rather
than as a public issue.

## License

[Apache 2.0](LICENSE). Use it, change it, ship it — keep the notice, state what
you changed, and the patent grant travels with the code.

---

<div align="center">
<sub>Built for Robinhood Chain.</sub>
</div>
