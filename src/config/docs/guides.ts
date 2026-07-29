import type { DocCategory } from "@/config/docs/types";

export const guides: DocCategory = {
  id: "guides",
  title: "Guides",
  description:
    "Task by task: analysing each kind of subject, watching one over time, streaming a run, and what the limits are.",
  pages: [
    {
      slug: "analyse-a-token",
      title: "Analyse a token",
      description:
        "What a token analysis checks, what each finding means, and how to read a score that carries missing checks.",
      blocks: [
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/token/{address}",
          auth: "required",
          summary: "Analyze a token",
        },
        {
          kind: "code",
          label: "curl",
          content: `curl https://api.molthood.org/api/v1/token/0x5fc5360d04… \\
  -H "Authorization: Bearer mk_live_..."`,
        },
        { kind: "heading", id: "what-it-checks", content: "What it checks" },
        {
          kind: "definitions",
          items: [
            {
              term: "Identity and supply",
              description: "Name, symbol, decimals, total supply, and holder count.",
            },
            {
              term: "Verification",
              description:
                "Whether published source exists for the contract. Unverified is a finding, not an absence.",
            },
            {
              term: "Owner powers",
              description:
                "What the owner can still do — mint, pause, blacklist, change fees. Found by scanning four-byte selectors, so it works even on an unverified contract.",
            },
            {
              term: "Tradability",
              description:
                "Whether a holder can actually sell. A honeypot is the one condition that makes every other signal beside the point.",
            },
            {
              term: "Market data",
              description: "Price, market cap, and volume where a source has them.",
            },
          ],
        },
        { kind: "heading", id: "reading-the-result", content: "Reading the result" },
        {
          kind: "text",
          content:
            "Start with `facts.risk` for the headline, then read `evidence[]` for the detail. Sort your attention by `state`: every `unknown` is something the platform wanted to check and could not, and `reason` says why.",
        },
        {
          kind: "callout",
          tone: "warning",
          title: "Unknowns are not padding",
          content:
            "A token with a high score and four unknowns is far less established than one with the same score and none. The score cannot account for checks that did not run — see [Risk scoring](/docs/concepts/risk-scoring).",
        },
        { kind: "heading", id: "run-it-again-later", content: "Run it again later" },
        {
          kind: "text",
          content:
            "Every run is stored against your key, so a second analysis of the same token produces a **change report** — what moved since last time. See [Change detection](/docs/guides/change-detection).",
        },
      ],
    },
    {
      slug: "analyse-a-wallet",
      title: "Analyse a wallet",
      description:
        "Balances plus a per-token risk screen, with an explicit ceiling when a check could not run.",
      blocks: [
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/wallet/{address}",
          auth: "required",
          summary: "Analyze a wallet",
        },
        {
          kind: "text",
          content:
            "A wallet analysis screens the tokens it holds using **the same scoring functions** a single token analysis uses. A token judged inside a portfolio gets the same verdict it would get on its own.",
        },
        { kind: "heading", id: "the-cap", content: "Why only some positions are screened" },
        {
          kind: "text",
          content:
            "Each position costs four explorer reads. An unbounded wallet would issue hundreds of requests and be rate-limited into returning nothing at all, so screening is capped at **eight positions** by default.",
        },
        {
          kind: "callout",
          tone: "note",
          title: "Positions past the cap are named, not dropped",
          content:
            "`skipped[]` lists the addresses and symbols that were not screened. Silently truncating would make a partial screen look like a complete one.",
        },
        { kind: "heading", id: "holdings", content: "Reading a holding" },
        {
          kind: "code",
          label: "facts.portfolio.holdings[]",
          content: `{
  "address": "0x…",
  "symbol": "TKN",
  "value_usd": 1240.5,
  "score": 63,
  "level": "moderate",
  "is_upper_bound": true,
  "checks_run": ["supply", "verification"],
  "checks_missed": ["tradability"],
  "signals": [ … ],
  "explorer_url": "https://…"
}`,
        },
        {
          kind: "text",
          content:
            "`is_upper_bound: true` means a check was missed and the real score can only be **lower** than shown. `score: null` with `level: \"unscored\"` means nothing could be established at all — which is not the same as a zero.",
        },
        { kind: "heading", id: "summary-fields", content: "Portfolio totals" },
        {
          kind: "definitions",
          items: [
            { term: "total_holdings", description: "Positions the wallet holds." },
            { term: "screened", description: "How many were actually screened." },
            { term: "flagged", description: "Screened positions carrying a risk signal." },
            { term: "unscored", description: "Screened but nothing could be established." },
          ],
        },
      ],
    },
    {
      slug: "analyse-a-contract",
      title: "Analyse a contract",
      description:
        "Verification, source availability, and the owner powers a selector scan can prove without source.",
      blocks: [
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/contract/{address}",
          auth: "required",
          summary: "Analyze a contract",
        },
        { kind: "heading", id: "unverified-contracts", content: "Unverified contracts" },
        {
          kind: "text",
          content:
            "An unverified contract is the case most tools give up on. Molthood still scans it: the deployed bytecode contains four-byte function selectors, and those selectors can be resolved against a public signature registry.",
        },
        {
          kind: "text",
          content:
            "That means owner powers — mint, pause, blacklist, fee changes — can often be **proved present** without any published source. What it cannot do is prove them absent, so those findings are `unknown` rather than `refuted`.",
        },
        {
          kind: "callout",
          tone: "note",
          title: "Presence and absence are not symmetric",
          content:
            "Finding a `mint` selector proves the power exists. Not finding one proves only that this scan did not find it. The report says which of the two it means.",
        },
        { kind: "heading", id: "what-you-get", content: "What you get" },
        {
          kind: "list",
          items: [
            "Whether published source exists, and a link to it if so.",
            "The owner powers the selector scan resolved, each with a severity.",
            "Proxy indicators, where the pattern is detectable.",
            "A risk score over all of it, on the same scale as a token.",
          ],
        },
      ],
    },
    {
      slug: "audit-a-website",
      title: "Audit a website",
      description:
        "Domain age, certificates, archive history, and page claims — the one analysis that needs no credential.",
      blocks: [
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/site?url={url}",
          auth: "required",
          summary: "Analyze a website",
        },
        {
          kind: "text",
          content:
            "A site audit is the demonstration that graceful degradation is real: it runs on sources that need no account at all, so a deployment with zero credentials can still do something genuinely useful.",
        },
        { kind: "heading", id: "what-it-reads", content: "What it reads" },
        {
          kind: "definitions",
          items: [
            {
              term: "Registration",
              description:
                "When the domain was registered, resolved through the authoritative registry for its TLD rather than a redirector.",
            },
            {
              term: "Certificates",
              description:
                "Public certificate transparency records — when certificates first appeared, and for which names.",
            },
            {
              term: "Archive history",
              description:
                "Whether the page has been archived before, and how far back. A site claiming years of history with no archive record is worth a second look.",
            },
            {
              term: "Page content",
              description:
                "What the page itself says: title, description, and the claims in its own text.",
            },
            { term: "DNS", description: "Resolution, over DNS-over-HTTPS." },
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          title: "Certificate lookups are slow",
          content:
            "Certificate transparency search routinely takes 30 seconds or more, so it gets a longer budget of its own. If it times out, that is an `unknown` finding with a reason — not a clean result.",
        },
      ],
    },
    {
      slug: "streaming",
      title: "Streaming a run",
      description:
        "Render the report about a third of the way in, and let the summary type in after it.",
      blocks: [
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/stream?target={target}&subject={subject}",
          auth: "required",
          summary: "Run an analysis and stream its progress",
        },
        {
          kind: "text",
          content:
            "The evidence is complete long before the run is. The AI summary is over half the wall time, so streaming lets the findings render as soon as they exist while the prose arrives afterwards. The work takes just as long; the finished parts stop waiting on the slow one.",
        },
        { kind: "heading", id: "the-events", content: "The events" },
        {
          kind: "text",
          content:
            "Server-sent events, one JSON object per `data:` frame:",
        },
        {
          kind: "code",
          label: "text/event-stream",
          content: `event: stage
data: {"stage":"agents","status":"running"}

event: evidence
data: {"items":[ … ]}

event: result
data: {"execution_id":"ex_…","facts":{ … }}

event: summary
data: {"summary":"…","summary_status":"generated"}

event: done
data: {"execution_id":"ex_…"}`,
        },
        { kind: "heading", id: "reading-it", content: "Reading it in a browser" },
        {
          kind: "callout",
          tone: "warning",
          title: "EventSource cannot send an Authorization header",
          content:
            "It also cannot tell you *why* a connection failed — only that it did. Read the response body with `fetch` instead, so an authentication failure reports itself as one.",
        },
        {
          kind: "code",
          label: "TypeScript",
          content: `const response = await fetch(url, {
  headers: {
    accept: "text/event-stream",
    authorization: \`Bearer \${key}\`,
  },
});

const reader = response.body!
  .pipeThrough(new TextDecoderStream())
  .getReader();

let buffer = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += value;

  let boundary = buffer.indexOf("\\n\\n");
  while (boundary !== -1) {
    const frame = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);
    boundary = buffer.indexOf("\\n\\n");
    // parse the "data:" line of \`frame\`
  }
}`,
        },
        {
          kind: "text",
          content:
            "Free-form requests use `POST /api/v1/execute` instead, because the router has to read the text before it knows the target.",
        },
      ],
    },
    {
      slug: "change-detection",
      title: "Change detection",
      description:
        "A second analysis of the same subject reports what moved — and which of those changes should alarm you.",
      blocks: [
        {
          kind: "text",
          content:
            "A single analysis is a photograph. Analysing the same subject again produces a **diff** against the previous run, and the diff is what turns a report into news.",
        },
        {
          kind: "text",
          content:
            "It runs automatically inside every execution. There is nothing to enable.",
        },
        { kind: "heading", id: "severity", content: "Severity" },
        {
          kind: "definitions",
          items: [
            {
              term: "alarming",
              description:
                "A claim that stopped holding, a new risk signal, a falling score, or supply appearing. The four cases worth interrupting a reader for.",
            },
            { term: "notable", description: "A material move that is not itself a warning." },
            { term: "informational", description: "Everything else that differs." },
          ],
        },
        { kind: "heading", id: "the-report", content: "The report" },
        {
          kind: "code",
          label: "facts.changes",
          content: `{
  "previous_execution_id": "ex_…",
  "previous_at": "2026-07-28T20:25:12Z",
  "elapsed_seconds": 46_800,
  "total": 3,
  "alarming": 1,
  "items": [
    {
      "kind": "risk_signal:new",
      "label": "Owner can pause transfers",
      "direction": "appeared",
      "severity": "alarming",
      "detail": "…",
      "before": null,
      "after": true
    }
  ]
}`,
        },
        {
          kind: "callout",
          tone: "note",
          title: "Nothing to compare against returns nothing",
          content:
            "A first run has no previous execution, so `facts.changes` is absent — not a report saying \"no changes\", which would claim the subject was checked and found unmoved.",
        },
        {
          kind: "text",
          content:
            "Comparison only looks back **30 days**. Beyond that it is archaeology rather than news, and \"the price moved\" over three months is not a finding.",
        },
      ],
    },
    {
      slug: "watches",
      title: "Watching a subject",
      description:
        "Re-run an analysis on a schedule and get a change report each time. Off by default, and it spends your quota.",
      blocks: [
        {
          kind: "text",
          content:
            "A watch re-runs an analysis on an interval. Because change detection already runs inside every execution, a scheduled run produces a change report for free — that diff is the entire product of a watch.",
        },
        {
          kind: "endpoint",
          method: "POST",
          path: "/api/v1/watches",
          auth: "required",
          summary: "Create a watch",
        },
        {
          kind: "code",
          label: "curl",
          content: `curl -X POST https://api.molthood.org/api/v1/watches \\
  -H "Authorization: Bearer mk_live_..." \\
  -H "content-type: application/json" \\
  -d '{
    "target": "token",
    "address": "0x5fc5360d04…",
    "label": "the one I keep an eye on",
    "interval_seconds": 3600
  }'`,
        },
        { kind: "heading", id: "what-it-costs", content: "What it costs" },
        {
          kind: "callout",
          tone: "warning",
          title: "A check spends your quota",
          content:
            "Exactly as a manual run does, and it is refused the same way when the allowance is gone. An hourly watch spends 24 of your 50 daily analyses.",
        },
        {
          kind: "text",
          content:
            "The minimum interval is **15 minutes** for this reason; the default is one hour. A one-minute interval would spend fifty units before lunch.",
        },
        { kind: "heading", id: "no-summary", content: "Scheduled runs skip the summary" },
        {
          kind: "text",
          content:
            "The AI summary is over half the wall time, and hourly prose about a token that has not moved is pure cost. A monitored run produces the diff and stops there.",
        },
        { kind: "heading", id: "when-a-check-fails", content: "When a check fails" },
        {
          kind: "text",
          content:
            "A failed check still records `last_checked_at`, or the watch would stay permanently due and retry in a tight loop against whatever is already broken. The reason is kept in `last_error`, so a watch that has gone quiet can say why rather than showing a stale timestamp that reads as \"all clear\".",
        },
        { kind: "heading", id: "managing", content: "Managing watches" },
        {
          kind: "table",
          head: ["Route", "Does"],
          rows: [
            ["`GET /api/v1/watches`", "List yours"],
            ["`GET /api/v1/watches/{id}`", "One watch, with its last result"],
            ["`POST /api/v1/watches/{id}/pause`", "Stop checking without deleting"],
            ["`POST /api/v1/watches/{id}/resume`", "Start again"],
            ["`DELETE /api/v1/watches/{id}`", "Remove it"],
          ],
        },
        {
          kind: "callout",
          tone: "note",
          title: "Monitoring is off by default on a deployment",
          content:
            "A monitor that started itself would begin spending every existing key's quota the moment a new version deployed. Operators switch it on deliberately.",
        },
      ],
    },
    {
      slug: "public-feed",
      title: "Publishing a run",
      description:
        "Executions are private. Publishing one is opt-in, per run, and redacts by selecting rather than removing.",
      blocks: [
        {
          kind: "text",
          content:
            "Every execution is private to the key that ran it. That is not a setting — it is the default, because an execution records the address somebody asked about.",
        },
        {
          kind: "endpoint",
          method: "POST",
          path: "/api/v1/feed/{execution_id}/publish",
          auth: "required",
          summary: "Opt one run into the public feed",
        },
        {
          kind: "text",
          content:
            "Only the key that ran an execution may publish it, so nobody can expose somebody else's analysis.",
        },
        { kind: "heading", id: "what-a-stranger-sees", content: "What a stranger sees" },
        {
          kind: "text",
          content:
            "The public shape is built by **selecting** fields, never by deleting them. That direction matters: a field added upstream later cannot leak by accident, because it is not on the list.",
        },
        {
          kind: "list",
          items: [
            "The kind of run, its status, and how long it took.",
            "Step labels and durations, in human phases rather than internal stage names.",
            "Counts — findings and sources.",
            "**Never** the address, the request text, the key, or any vendor name.",
          ],
        },
        {
          kind: "table",
          head: ["Route", "Auth", "Does"],
          rows: [
            ["`GET /api/v1/feed`", "None", "Published runs, newest first"],
            ["`GET /api/v1/feed/stream`", "None", "The same feed as server-sent events"],
          ],
        },
      ],
    },
    {
      slug: "limits",
      title: "Limits and timings",
      description:
        "Quotas, rate limits, caps, and how long each kind of analysis actually takes.",
      blocks: [
        { kind: "heading", id: "quotas", content: "Quotas" },
        {
          kind: "table",
          head: ["Limit", "Default"],
          rows: [
            ["Analyses per UTC day, self-serve key", "50"],
            ["Analyses per UTC day, admin key", "1,000"],
            ["Keys one address may create per day", "3"],
            ["Requests per minute, per process", "60"],
          ],
        },
        { kind: "heading", id: "caps", content: "Caps" },
        {
          kind: "table",
          head: ["Cap", "Default", "Why"],
          rows: [
            ["Wallet positions screened", "8", "Each costs four explorer reads"],
            ["Change lookback", "30 days", "Older than that is archaeology, not news"],
            ["Cached analysis reused for", "10 minutes", "The chain does not move meaningfully inside it"],
            ["Minimum watch interval", "15 minutes", "Each check spends a unit of quota"],
            ["Execution timeout", "60 seconds", "A run that cannot finish should say so"],
            ["Downloaded page size", "5 MB", "An arbitrary URL may point at a huge file"],
          ],
        },
        { kind: "heading", id: "timings", content: "How long things take" },
        {
          kind: "text",
          content:
            "Measured from real runs. These are medians — one cold start against a throttled source is not representative.",
        },
        {
          kind: "table",
          head: ["Analysis", "Typical"],
          rows: [
            ["Token", "~8 s"],
            ["Contract", "~17 s"],
            ["Wallet (portfolio screen)", "~26 s"],
            ["Website audit", "Varies; certificate lookups alone can take 30 s+"],
          ],
        },
        {
          kind: "callout",
          tone: "note",
          title: "Streaming does not make it faster",
          content:
            "It makes the finished parts visible sooner. Evidence is complete about a third of the way in — see [Streaming](/docs/guides/streaming).",
        },
      ],
    },
  ],
};
