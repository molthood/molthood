## What changed

<!-- And, more usefully, why it needed to. -->

## How it was verified

<!-- What you ran, and what you saw. "Tests pass" is weaker than "reproduced
     the bug, fixed it, confirmed the failing case now returns unknown". -->

## Checklist

- [ ] `npm run typecheck && npm run lint && npm run build`
- [ ] `ruff format --check app tests && ruff check app tests && mypy app && pytest` (if the backend changed)
- [ ] A check that can fail reports `unknown` with a reason, rather than nothing
- [ ] Content changes went into `src/config/`, not into JSX
