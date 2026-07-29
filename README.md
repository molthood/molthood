# Molthood

AI execution agents for **Robinhood Chain**.
One request. Multiple agents. Zero manual work.

> **Phase 1 — Foundation & Premium Landing.**
> This repository currently contains the frontend foundation only. There is no AI,
> backend, database, API integration, or authentication yet.

## Getting started

```bash
npm install
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Routes

| Route      | Description                                            |
| ---------- | ------------------------------------------------------ |
| `/`        | Landing page — hero, execution model, pipeline, agents |
| `/console` | Application shell with sidebar and topbar              |
| `/docs`    | Documentation homepage                                 |
| `/api`     | API platform homepage                                  |

Console sub-routes: `/console/agents`, `/console/projects`, `/console/executions`,
`/console/reports`, `/console/history`, `/console/settings`.

## Scripts

| Script              | Purpose                    |
| ------------------- | -------------------------- |
| `npm run dev`       | Development server         |
| `npm run build`     | Production build           |
| `npm run start`     | Serve the production build |
| `npm run typecheck` | `tsc --noEmit`             |
| `npm run lint`      | ESLint                     |

## Design tokens

Defined once in [`src/app/globals.css`](src/app/globals.css) and consumed as
Tailwind utilities.

The theme is a full electric-lime field with heavy black type. On a lime field
the accent *is* the ink, so `primary` resolves to black — buttons, indicators,
and icons all render dark against the green.

| Token          | Value     | Role                      |
| -------------- | --------- | ------------------------- |
| Background     | `#BDF83C` | Electric lime — the field |
| Surface        | `#AEEB2E` | Recessed panels, cards    |
| Surface raised | `#CBFF5B` | Hover / raised state      |
| Border         | `#93CE1F` | Hairlines                 |
| Border strong  | `#79AD12` | Hover hairlines           |
| Text           | `#08120D` | Black                     |
| Muted          | `#17200B` | Secondary text            |
| Primary        | `#08120D` | CTAs and accents (black)  |
| Danger         | `#6B0D0D` | Validation errors         |

Changing the field is a one-line edit: `--color-background` in
[`src/app/globals.css`](src/app/globals.css).

Type is weighted up across the board: body copy sits at 500, headings at 700,
and no text renders below 500 anywhere on the field.

Typography: **Geist** for headings, **Inter** for body, **JetBrains Mono** for code.

See [AGENTS.md](AGENTS.md) for architecture conventions.
