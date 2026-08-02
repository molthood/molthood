# Security

Molthood is a **read-only** analysis platform. It reads public chain state and
public web pages. It has no custody, signs nothing, and submits no
transactions. There is no wallet connection anywhere in the product.

> **Nobody from Molthood will ever ask for a seed phrase or a private key.**
> There is no feature that could use one. Any request claiming otherwise is not
> us, regardless of what it looks like.

## Reporting a vulnerability

Please report privately rather than opening a public issue, and give us a
chance to fix it before disclosure.

Use GitHub's [private vulnerability
reporting](https://github.com/molthood/molthood/security/advisories/new) on
this repository.

Useful in a report: what you did, what happened, what you expected, and the
smallest reproduction you have. A proof of concept is welcome; please do not
run one against production infrastructure or against other people's data.

We will acknowledge a report, tell you whether it is in scope, and keep you
informed while it is being fixed.

## In scope

- Anything that exposes a credential, another user's data, or an execution
  history that is not the reporter's
- Server-side request forgery through a supplied URL or address
- Injection into the analysis pipeline or the artifact generation path
- Authentication or allowance bypass on the metered endpoints

## Out of scope

- Findings that require a compromised device or a self-XSS
- Rate limiting on unauthenticated public endpoints, which is deliberate
- Missing security headers with no demonstrated impact
- Automated scanner output with no working reproduction

## How credentials are handled

API keys are shown once and stored hashed — a lost key is replaced, not
recovered. Provider credentials are read server-side only; no key that costs
money is ever included in code served to a browser. Outbound requests built
from user input are validated before they are made, so a supplied URL cannot be
used to reach a private network address.
