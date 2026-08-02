# Contributing

Thanks for looking. This document is short on ceremony and specific about the
two or three things that actually matter here.

## Read the guide for the area first

- [`AGENTS.md`](AGENTS.md) — the frontend, and the rules both apps share
- [`backend/README.md`](backend/README.md) — the analysis engine

They explain *why* the code is shaped the way it is. Most review comments on a
first pull request are things one of those two files already answers.

## The rule that outranks the others

**A check that could not run must never render as a check that came back
clean.**

Concretely, when you add anything that gathers or displays a fact:

- A failure is a value, not an exception. Return `unknown` with a reason;
  do not swallow it and do not let it fall through as absence.
- An upstream source answering successfully with an empty field is a *finding*,
  not a gap. Decide what the emptiness means.
- A score computed with a missing input is a ceiling. Say so.

If a change could make one of those quietly wrong, it needs a test.

## Workflow

1. Branch from `main`.
2. Make the change. Match the surrounding code — its naming, its comment
   density, its idioms.
3. Run the gate locally:

   ```bash
   npm run typecheck && npm run lint && npm run build
   cd backend && ruff format --check app tests && ruff check app tests && mypy app && pytest
   ```

   CI runs the same commands. `ruff check` and `ruff format --check` are
   different tools with the same prefix; running only the first is the usual
   way a red build gets pushed.

4. Open a pull request describing what changed and why. If you found a bug
   while building, say what it was — that is often the most useful part.

## Commit messages

Write what changed and the reason it needed to. A message that only restates
the diff is worth less than the diff.

## Content lives in config

Adding an agent, a documentation page, a roadmap entry or a navigation item
means editing `src/config/`, not JSX. Scoring rules live in
`backend/app/agents/risk/signals.py` as pure functions and are shared by every
surface that screens a token — never write a second copy for a new screen.
