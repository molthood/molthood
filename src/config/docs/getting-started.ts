import type { DocCategory } from "@/config/docs/types";

export const gettingStarted: DocCategory = {
  id: "getting-started",
  title: "Getting started",
  description:
    "What Molthood does, how to get a key, and how to run your first analysis end to end.",
  pages: [
    {
      slug: "introduction",
      title: "Introduction",
      description:
        "Molthood is an execution platform, not a chat interface. It gathers evidence and tells you what it could not check.",
      blocks: [
        {
          kind: "text",
          content:
            "Molthood analyses tokens, wallets, contracts, and websites on **Robinhood Chain**. You send one request; a router picks the agents, the agents call real sources, and you get back a report of findings — each one carrying the URL it came from.",
        },
        {
          kind: "text",
          content:
            "It is not a chat interface. There is no conversation, no persona, and no generated opinion presented as a fact. The optional summary at the end is clearly marked as model-written, and everything above it is evidence you can click through and verify yourself.",
        },
        { kind: "heading", id: "what-makes-it-different", content: "What makes it different" },
        {
          kind: "text",
          content:
            "Most tools that check a token answer every question with a yes or a no. When a source is down, or a contract is unverified, or an API key is missing, those tools quietly answer *no* — and a reader cannot tell that apart from a genuine clean result.",
        },
        {
          kind: "text",
          content:
            "Molthood refuses to do that. Every finding is `confirmed`, `refuted`, or `unknown`, and `unknown` carries the reason. A check that could not run never renders as a check that came back clean. This single rule shapes the whole product — see [Evidence](/docs/concepts/evidence).",
        },
        {
          kind: "callout",
          tone: "note",
          title: "Read the score the right way round",
          content:
            "A risk score runs from 0 to 100 where **higher is safer**. 88 is a low-risk subject; 30 is a high-risk one. The level is always shown next to the number for exactly this reason.",
        },
        { kind: "heading", id: "what-it-analyses", content: "What it analyses" },
        {
          kind: "definitions",
          items: [
            {
              term: "Token",
              description:
                "Supply, holders, verification status, owner powers, and tradability. The most complete surface.",
            },
            {
              term: "Wallet",
              description:
                "Balances plus a risk screen of each token held, using the same scoring rules a single token gets.",
            },
            {
              term: "Contract",
              description:
                "Verification, source availability, and the owner powers a four-byte selector scan can prove.",
            },
            {
              term: "Website",
              description:
                "Domain age, certificates, archive history, and what the page itself claims. No key required.",
            },
            {
              term: "Chain",
              description:
                "Network-level statistics: blocks, addresses, transactions, gas, and market figures.",
            },
          ],
        },
        { kind: "heading", id: "where-to-go-next", content: "Where to go next" },
        {
          kind: "list",
          items: [
            "[Quickstart](/docs/getting-started/quickstart) — a key and a first analysis in about two minutes.",
            "[Evidence](/docs/concepts/evidence) — the three-state model, and why it exists.",
            "[API reference](/docs/api/conventions) — every route, with its auth requirement.",
            "[FAQ](/docs/faq/general) — the questions people actually ask.",
          ],
        },
      ],
    },
    {
      slug: "quickstart",
      title: "Quickstart",
      description:
        "Create a key, run an analysis, and read the result — three requests, no SDK to install.",
      blocks: [
        {
          kind: "text",
          content:
            "Everything here is plain HTTP. There is no package to install and no client to keep in sync.",
        },
        { kind: "heading", id: "step-1-get-a-key", content: "1. Get a key" },
        {
          kind: "text",
          content:
            "Analyses cost real inference credit, so they are metered. Creating a key needs no account and no payment details.",
        },
        {
          kind: "code",
          label: "curl",
          content: `curl -X POST https://api.molthood.org/api/v1/keys \\
  -H "content-type: application/json" \\
  -d '{"label": "my first key"}'`,
        },
        {
          kind: "code",
          label: "response",
          content: `{
  "key": "mk_live_...",
  "hint": "mk_live_ab…",
  "label": "my first key",
  "daily_quota": 50,
  "note": "Store this now. It is not recoverable."
}`,
        },
        {
          kind: "callout",
          tone: "warning",
          title: "The key is shown once",
          content:
            "Only a hash is stored. If you lose it, create another — three per address per day. Everything you run is scoped to the key that ran it, so a new key starts with empty history.",
        },
        { kind: "heading", id: "step-2-run-an-analysis", content: "2. Run an analysis" },
        {
          kind: "code",
          label: "curl",
          content: `curl https://api.molthood.org/api/v1/token/0x5fc5360d04… \\
  -H "Authorization: Bearer mk_live_..."`,
        },
        {
          kind: "text",
          content:
            "A token analysis takes roughly eight seconds. Wallets and contracts take longer because they make more upstream calls — see [Limits](/docs/guides/limits).",
        },
        { kind: "heading", id: "step-3-read-the-result", content: "3. Read the result" },
        {
          kind: "text",
          content:
            "The response is the same shape for every target. The fields that matter most on a first read:",
        },
        {
          kind: "definitions",
          items: [
            {
              term: "evidence[]",
              description:
                "The findings. Each has a `state` of confirmed, refuted, or unknown, and a `source_url` you can open.",
            },
            {
              term: "facts.risk",
              description:
                "The score and level, plus the signals that produced them. Higher is safer.",
            },
            {
              term: "summary",
              description:
                "Model-written prose. `summary_status` says whether it was generated, skipped, or never configured.",
            },
            {
              term: "sources[]",
              description: "Every place the run read from, with links.",
            },
            {
              term: "execution_id",
              description:
                "Stable. Fetch it again later, or compare against it to see what changed.",
            },
          ],
        },
        {
          kind: "callout",
          tone: "note",
          title: "Identical requests are cached",
          content:
            "Re-running the same subject within ten minutes returns the stored result rather than spending another unit of quota. The chain does not move meaningfully inside that window.",
        },
        { kind: "heading", id: "next", content: "Next" },
        {
          kind: "list",
          items: [
            "[Authentication](/docs/getting-started/authentication) — quotas, scoping, and what an admin key can do.",
            "[Analyse a token](/docs/guides/analyse-a-token) — what each finding means.",
            "[Streaming](/docs/guides/streaming) — render the report before the summary finishes.",
          ],
        },
      ],
    },
    {
      slug: "authentication",
      title: "Authentication",
      description:
        "How keys work, what they are allowed to see, and the two separate limits that apply to them.",
      blocks: [
        {
          kind: "text",
          content:
            "Every analysis route requires a key. Send it as a bearer token:",
        },
        {
          kind: "code",
          label: "header",
          content: `Authorization: Bearer mk_live_...`,
        },
        {
          kind: "text",
          content:
            "`x-api-key: mk_live_...` is accepted as well, for clients that cannot set an Authorization header.",
        },
        { kind: "heading", id: "what-a-key-scopes", content: "What a key scopes" },
        {
          kind: "text",
          content:
            "A key is not just a password — it is the boundary around your data. Every execution records the key that ran it, and history, permalinks, the cache, the watchlist, and change detection are all scoped to it.",
        },
        {
          kind: "text",
          content:
            "That matters because a wallet analysis records the address somebody asked about. Publishing that on a shared list is not an acceptable default, so nothing is shared unless you explicitly publish it — see [Public feed](/docs/guides/public-feed).",
        },
        { kind: "heading", id: "two-separate-limits", content: "Two separate limits" },
        {
          kind: "text",
          content:
            "Pace and spend are limited by different mechanisms, deliberately.",
        },
        {
          kind: "table",
          head: ["Limit", "What it protects", "Where it lives"],
          rows: [
            [
              "Rate limit",
              "The server, from a burst",
              "In memory, per process, reset on restart",
            ],
            [
              "Daily quota",
              "Your inference credit",
              "In the database, durable across restarts",
            ],
          ],
        },
        {
          kind: "text",
          content:
            "The quota is the one that guards money, which is why it is stored rather than held in memory. A self-serve key gets **50 analyses per UTC day**.",
        },
        {
          kind: "code",
          label: "check your remaining quota",
          content: `curl https://api.molthood.org/api/v1/keys/me \\
  -H "Authorization: Bearer mk_live_..."`,
        },
        { kind: "heading", id: "admin-keys", content: "Admin keys" },
        {
          kind: "text",
          content:
            "The first key a deployment mints is an admin key. It carries a larger quota, can list and revoke other keys, and — importantly — **reads every execution, not only its own**.",
        },
        {
          kind: "callout",
          tone: "danger",
          title: "An admin key sees what everyone asked about",
          content:
            "Because executions record addresses, an admin key can read the subjects other people analysed. Use an ordinary key for day-to-day work and keep the admin key for operating the platform.",
        },
        { kind: "heading", id: "errors", content: "Errors" },
        {
          kind: "table",
          head: ["Status", "Code", "Meaning"],
          rows: [
            ["401", "`authentication_required`", "No key was sent."],
            [
              "401",
              "`invalid_api_key`",
              "The key is unknown or revoked — the same message for both, so the endpoint cannot confirm which keys once existed.",
            ],
            ["403", "`forbidden`", "The route needs an admin key."],
            ["429", "`rate_limited`", "Too many requests too quickly. Retry after the delay in the response."],
            ["429", "`quota_exhausted`", "The daily allowance is spent. `resets_at` says when it returns."],
          ],
        },
      ],
    },
  ],
};
