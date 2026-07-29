import type { DocCategory } from "@/config/docs/types";

export const apiReference: DocCategory = {
  id: "api",
  title: "API reference",
  description:
    "Every route on the HTTP surface, with its authentication requirement and response contract.",
  pages: [
    {
      slug: "conventions",
      title: "Conventions",
      description:
        "Base URL, authentication, error shape, pagination — the things that are true of every route.",
      blocks: [
        { kind: "heading", id: "base-url", content: "Base URL" },
        { kind: "code", label: "production", content: `https://api.molthood.org` },
        {
          kind: "text",
          content:
            "Every versioned route is under `/api/v1`. `/health`, `/api/health`, and `/version` sit outside it deliberately — orchestrators probe those, and they must not move when the API version does.",
        },
        { kind: "heading", id: "authentication", content: "Authentication" },
        {
          kind: "code",
          label: "header",
          content: `Authorization: Bearer mk_live_...`,
        },
        {
          kind: "text",
          content:
            "See [Authentication](/docs/getting-started/authentication) for quotas and scoping.",
        },
        { kind: "heading", id: "errors", content: "Errors" },
        {
          kind: "text",
          content:
            "Every failure has the same shape. It always names a machine-readable `code` and, wherever one exists, a **suggested action** — an error that tells you what to do next is worth more than one that only tells you what went wrong.",
        },
        {
          kind: "code",
          label: "error",
          content: `{
  "error": {
    "code": "authentication_required",
    "message": "This endpoint requires an API key.",
    "suggested_action": "Send \`Authorization: Bearer <key>\`. Create one with POST /api/v1/keys.",
    "details": {}
  },
  "request_id": "d450691ae68b4fe7a253d19d237b7a7f"
}`,
        },
        {
          kind: "text",
          content:
            "`request_id` is also returned as the `x-request-id` header on every response, and `x-response-time-ms` carries the server-side duration.",
        },
        { kind: "heading", id: "pagination", content: "Pagination" },
        {
          kind: "text",
          content:
            "List routes take `page` and `page_size`, and return a `meta` object with `total`, `page`, and `page_size`.",
        },
        { kind: "heading", id: "cors", content: "CORS" },
        {
          kind: "text",
          content:
            "Allowed origins are configured explicitly. There is no wildcard, because credentials are permitted — a wildcard would let any origin call the API with a caller's key.",
        },
      ],
    },
    {
      slug: "analysis",
      title: "Analysis",
      description: "Run an analysis: by target, by free-form request, or as a stream.",
      blocks: [
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/token/{address}",
          auth: "required",
          summary: "Analyze a token",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/wallet/{address}",
          auth: "required",
          summary: "Analyze a wallet, screening the tokens it holds",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/contract/{address}",
          auth: "required",
          summary: "Analyze a contract",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/site",
          auth: "required",
          summary: "Analyze a website. Requires the `url` query parameter",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/project",
          auth: "required",
          summary: "Analyze the chain itself",
        },
        { kind: "heading", id: "free-form", content: "Free-form requests" },
        {
          kind: "endpoint",
          method: "POST",
          path: "/api/v1/execute",
          auth: "required",
          summary: "Submit a request and let the router classify it",
        },
        {
          kind: "code",
          label: "body",
          content: `{
  "request": "is 0x5fc5360d04… safe to buy",
  "pipeline": "standard",
  "metadata": {}
}`,
        },
        {
          kind: "text",
          content:
            "`request` is required. `pipeline` defaults to `standard`. If the router cannot identify a target it fails cleanly with a reason rather than guessing.",
        },
        { kind: "heading", id: "streaming", content: "Streaming" },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/stream",
          auth: "required",
          summary: "Run an analysis and stream progress as server-sent events",
        },
        {
          kind: "text",
          content:
            "Takes `target` and `subject` as query parameters. See [Streaming](/docs/guides/streaming) for the event shapes.",
        },
        { kind: "heading", id: "response", content: "The response shape" },
        {
          kind: "text",
          content:
            "Every analysis returns the same object, for every target:",
        },
        {
          kind: "code",
          label: "ExecutionResponse",
          content: `{
  "execution_id": "ex_…",
  "status": "succeeded",
  "stage": "report",
  "target": "token",
  "address": "0x…",
  "agents_used": ["market", "risk"],
  "services_called": ["…"],
  "summary": "…",
  "summary_status": "generated",
  "summary_detail": null,
  "summary_model": "…",
  "facts": { "risk": { … }, "changes": { … } },
  "evidence": [ … ],
  "sources": [ { "label": "…", "url": "https://…" } ],
  "stages": [ { "stage": "agents", "success": true, "duration_ms": 4102 } ],
  "tasks":  [ { "name": "…", "status": "succeeded" } ],
  "execution_time_ms": 7796,
  "error": null
}`,
        },
        {
          kind: "definitions",
          items: [
            {
              term: "summary_status",
              description:
                "`generated`, `skipped`, `failed`, `pending`, or `not_configured` — never an empty summary with no explanation.",
            },
            {
              term: "stages[] / tasks[]",
              description:
                "What actually ran, including what was skipped and why. A report that hid this could not be checked.",
            },
          ],
        },
      ],
    },
    {
      slug: "executions",
      title: "Executions",
      description: "Stored runs, permalinks, and the subjects derived from them.",
      blocks: [
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/executions",
          auth: "required",
          summary: "List your recent executions. Takes `status`, `page`, `page_size`",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/executions/subjects",
          auth: "required",
          summary: "Everything you have analysed, grouped by subject",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/executions/{execution_id}",
          auth: "required",
          summary: "One execution's metadata",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/executions/{execution_id}/result",
          auth: "required",
          summary: "The complete stored result — evidence, sources, and summary",
        },
        {
          kind: "callout",
          tone: "note",
          title: "A permalink is a recording, not a re-run",
          content:
            "Fetching a stored result returns the findings exactly as the original analysis produced them. A reader following a shared link sees what was found then, not a fresh run against a chain that has moved.",
        },
        { kind: "heading", id: "subjects", content: "Subjects" },
        {
          kind: "text",
          content:
            "Subjects are derived from executions rather than stored separately — a \"project\" nobody has to create and name. A subject that has been looked at more than once is the interesting one, because it is the only case where \"what changed\" has an answer.",
        },
        {
          kind: "code",
          label: "response",
          content: `{
  "items": [
    {
      "target": "token",
      "address": "0x…",
      "runs": 3,
      "succeeded": 3,
      "first_seen": "…",
      "last_seen": "…",
      "last_execution_id": "ex_…",
      "findings": 20,
      "risk_score": 88,
      "risk_level": "low",
      "changes": 0,
      "alarming": 0
    }
  ],
  "total": 9,
  "revisited": 6
}`,
        },
        {
          kind: "callout",
          tone: "danger",
          title: "Scoping",
          content:
            "These routes return only your key's executions. An admin key returns everyone's — including the addresses they asked about.",
        },
      ],
    },
    {
      slug: "tasks",
      title: "Tasks",
      description:
        "One request, one report: classify, resolve a workflow, run what is available, and say what was skipped.",
      blocks: [
        {
          kind: "endpoint",
          method: "POST",
          path: "/api/v1/tasks",
          auth: "required",
          summary: "Submit one task and get one report",
        },
        {
          kind: "code",
          label: "body",
          content: `{
  "request": "research how honeypot contracts trap sellers",
  "use_cache": true
}`,
        },
        {
          kind: "text",
          content:
            "The orchestrator classifies the request, resolves the workflow against what actually exists on this deployment, runs the independent steps together and the dependent ones after, and assembles a report.",
        },
        { kind: "heading", id: "guarantees", content: "Four properties, each with a test" },
        {
          kind: "list",
          items: [
            "A skipped step appears in the timeline **with its reason**.",
            "A failing step does not fail the task.",
            "`confidence` is derived from what actually ran.",
            "`confidence` is `unknown` rather than `low` when nothing was established at all.",
          ],
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/tasks/{task_id}",
          auth: "required",
          summary: "Retrieve a task report",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/tasks/preview/plan",
          auth: "none",
          summary: "What a request would do, before anything is spent",
        },
      ],
    },
    {
      slug: "watches",
      title: "Watches",
      description: "Scheduled re-analysis of a subject, and the change report each check produces.",
      blocks: [
        {
          kind: "endpoint",
          method: "POST",
          path: "/api/v1/watches",
          auth: "required",
          summary: "Create a watch",
        },
        {
          kind: "code",
          label: "body",
          content: `{
  "target": "token",
  "address": "0x…",
  "label": "",
  "interval_seconds": 3600
}`,
        },
        {
          kind: "text",
          content:
            "`target` is required. `interval_seconds` defaults to one hour and cannot go below fifteen minutes — each check spends a unit of your quota.",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/watches",
          auth: "required",
          summary: "List your watches",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/watches/{watch_id}",
          auth: "required",
          summary: "One watch, with its last result and last error",
        },
        {
          kind: "endpoint",
          method: "POST",
          path: "/api/v1/watches/{watch_id}/pause",
          auth: "required",
          summary: "Stop checking without deleting",
        },
        {
          kind: "endpoint",
          method: "POST",
          path: "/api/v1/watches/{watch_id}/resume",
          auth: "required",
          summary: "Start checking again",
        },
        {
          kind: "endpoint",
          method: "DELETE",
          path: "/api/v1/watches/{watch_id}",
          auth: "required",
          summary: "Remove a watch",
        },
      ],
    },
    {
      slug: "keys",
      title: "Keys",
      description: "Create a key, check your remaining allowance, and — with an admin key — manage others.",
      blocks: [
        {
          kind: "endpoint",
          method: "POST",
          path: "/api/v1/keys",
          auth: "none",
          summary: "Create a key. Body takes an optional `label`",
        },
        {
          kind: "callout",
          tone: "warning",
          title: "Returned once",
          content:
            "The secret exists in the response and nowhere else — the server keeps a hash. Three keys per address per day.",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/keys/me",
          auth: "required",
          summary: "Your quota, usage, and reset time",
        },
        {
          kind: "code",
          label: "response",
          content: `{
  "hint": "mk_live_ab…",
  "label": "my first key",
  "daily_quota": 50,
  "used_today": 12,
  "remaining": 38,
  "resets_at": "2026-07-31T00:00:00+00:00",
  "is_admin": false
}`,
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/keys",
          auth: "admin",
          summary: "List every key",
        },
        {
          kind: "endpoint",
          method: "POST",
          path: "/api/v1/keys/{key_id}/revoke",
          auth: "admin",
          summary: "Revoke a key",
        },
      ],
    },
    {
      slug: "chain-and-agents",
      title: "Chain and agents",
      description: "Read chain statistics and the live agent registry. No analysis, no quota.",
      blocks: [
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/chain/stats",
          auth: "none",
          summary: "Network and market statistics for Robinhood Chain",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/chain/tokens",
          auth: "none",
          summary: "Tokens known to the explorer",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/agents",
          auth: "none",
          summary: "The live agent registry, with real run counts and timings",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/agents/{agent_id}",
          auth: "none",
          summary: "One agent in detail",
        },
        {
          kind: "text",
          content:
            "Agent statistics are counted from stored runs, so an agent nobody has executed reports zero runs and no timing rather than a plausible-looking success rate. Durations are **medians**: one cold start against a throttled provider should not become an agent's advertised speed.",
        },
        {
          kind: "callout",
          tone: "note",
          title: "Unauthenticated on purpose",
          content:
            "These routes describe the runtime, not anybody's work. That is also the constraint on what they may report about past runs — counts, timings, and subject *kinds* only, never an address or a request.",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/pipelines",
          auth: "none",
          summary: "The pipeline stages an execution moves through",
        },
      ],
    },
    {
      slug: "providers-and-health",
      title: "Providers and health",
      description: "What is configured, what is missing, and whether the service can actually store anything.",
      blocks: [
        {
          kind: "endpoint",
          method: "GET",
          path: "/health",
          auth: "none",
          summary: "Liveness. A flat 200 whenever the process is serving",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/health",
          auth: "none",
          summary: "Full readiness: every provider, every missing variable, and storage",
        },
        {
          kind: "callout",
          tone: "warning",
          title: "Do not point an orchestrator at /api/health",
          content:
            "It reports `degraded` when a provider has no key. A platform health check reading that would restart a perfectly working service on every deploy — which fixes nothing and drops live requests. `/health` is the probe.",
        },
        { kind: "heading", id: "storage", content: "Storage is reported explicitly" },
        {
          kind: "code",
          label: "database",
          content: `"database": {
  "reachable": true,
  "tables": 7,
  "missing_tables": [],
  "dialect": "postgresql",
  "detail": null,
  "ephemeral": false
}`,
        },
        {
          kind: "text",
          content:
            "Connectivity and schema are checked separately because they fail separately. A database that answers `SELECT 1` but has no tables is not usable, and reporting it as healthy would be the same error the evidence model exists to prevent. `ephemeral: true` means SQLite on a container filesystem — it works, and it forgets everything on the next deploy.",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/providers",
          auth: "none",
          summary: "Every capability provider and its state",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/providers/plan",
          auth: "none",
          summary: "What a given request would do here. Takes `request`",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/providers/workflows",
          auth: "none",
          summary: "Every workflow and the capabilities it needs",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/status",
          auth: "none",
          summary: "Service-level status",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/version",
          auth: "none",
          summary: "Build and environment information",
        },
      ],
    },
    {
      slug: "feed",
      title: "Public feed",
      description: "The runs whose owners chose to publish them. The only unauthenticated view of execution data.",
      blocks: [
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/feed",
          auth: "none",
          summary: "Published runs, newest first. Takes `limit`",
        },
        {
          kind: "endpoint",
          method: "GET",
          path: "/api/v1/feed/stream",
          auth: "none",
          summary: "The same feed as server-sent events",
        },
        {
          kind: "endpoint",
          method: "POST",
          path: "/api/v1/feed/{execution_id}/publish",
          auth: "required",
          summary: "Publish or unpublish one of your runs",
        },
        {
          kind: "text",
          content:
            "Nothing appears here unless its owner published it. See [Publishing a run](/docs/guides/public-feed) for exactly what a stranger can see.",
        },
      ],
    },
  ],
};
