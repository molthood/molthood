/**
 * The API surface, transcribed from the running service's OpenAPI document.
 *
 * Every path here exists. The previous version of this file advertised
 * `/v1/executions/{id}/approve`, `/v1/executions/{id}/evidence`,
 * `/v1/reports/{id}` and a `DELETE`, none of which were ever built, alongside
 * an SDK package and a webhook delivery system that do not exist. Documenting
 * an endpoint that returns 404 is the same failure as inventing a number.
 *
 * When the backend gains a route, add it here — do not add it here first.
 */

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type ApiEndpoint = {
  method: HttpMethod;
  path: string;
  description: string;
};

/** Analysis routes. Each runs the pipeline and returns evidence plus sources. */
export const analysisEndpoints: ApiEndpoint[] = [
  {
    method: "POST",
    path: "/api/v1/tasks",
    description:
      "Submit one task. Routes it through the providers this deployment has and returns a structured report, including the steps that did not run and why.",
  },
  {
    method: "GET",
    path: "/api/v1/tasks/{task_id}",
    description: "Retrieve a finished report. Held for 24 hours.",
  },
  {
    method: "POST",
    path: "/api/v1/execute",
    description:
      "Submit a free-form request. The router infers the target from the text.",
  },
  {
    method: "GET",
    path: "/api/v1/token/{address}",
    description: "Analyze a token: metadata, holders, price, and risk.",
  },
  {
    method: "GET",
    path: "/api/v1/wallet/{address}",
    description: "Analyze a wallet's holdings and activity.",
  },
  {
    method: "GET",
    path: "/api/v1/contract/{address}",
    description: "Analyze a contract's verification state and source.",
  },
  {
    method: "GET",
    path: "/api/v1/project",
    description: "A network-level overview of Robinhood Chain.",
  },
  {
    method: "GET",
    path: "/api/v1/site",
    description:
      "Off-chain intelligence for a domain: published policies, DNS and mail posture, registration, and archive history.",
  },
  {
    method: "GET",
    path: "/api/v1/stream",
    description:
      "The same analysis as server-sent events: stage progress, then the full evidence, then the summary token by token.",
  },
];

/** Chain data, read straight from the RPC node and the explorer. */
export const chainEndpoints: ApiEndpoint[] = [
  {
    method: "GET",
    path: "/api/v1/chain/stats",
    description: "Live chain statistics.",
  },
  {
    method: "GET",
    path: "/api/v1/chain/tokens",
    description:
      "Tokens tracked on the chain, with live prices. Pass `q` to search by ticker.",
  },
];

/** Platform introspection. */
export const platformEndpoints: ApiEndpoint[] = [
  {
    method: "GET",
    path: "/api/v1/executions",
    description: "List recent executions, newest first.",
  },
  {
    method: "GET",
    path: "/api/v1/executions/{execution_id}",
    description: "Retrieve one execution with its pipeline stages.",
  },
  {
    method: "GET",
    path: "/api/v1/executions/{execution_id}/result",
    description:
      "The stored result in full — what a shared link renders, rather than a fresh run against a chain that has moved.",
  },
  { method: "GET", path: "/api/v1/agents", description: "List the registered agents." },
  {
    method: "GET",
    path: "/api/v1/agents/{agent_id}",
    description: "Retrieve one agent's capabilities.",
  },
  {
    method: "GET",
    path: "/api/v1/watches",
    description:
      "Your watchlist. Each entry is re-analysed on a schedule and reports what changed.",
  },
  {
    method: "POST",
    path: "/api/v1/watches",
    description:
      "Watch a subject. Every check spends one unit of the key's daily analysis quota.",
  },
  {
    method: "POST",
    path: "/api/v1/keys",
    description:
      "Create an API key. Returned once and stored only as a hash — analyses require one.",
  },
  {
    method: "GET",
    path: "/api/v1/keys/me",
    description: "Quota and usage for the key in use, and when the allowance resets.",
  },
  { method: "GET", path: "/api/v1/pipelines", description: "List the pipelines." },
  {
    method: "GET",
    path: "/api/v1/status",
    description: "Component readiness and the live state of every upstream service.",
  },
  { method: "GET", path: "/health", description: "Liveness probe." },
  { method: "GET", path: "/version", description: "Build and environment information." },
];

export const apiEndpoints: ApiEndpoint[] = [
  ...analysisEndpoints,
  ...chainEndpoints,
  ...platformEndpoints,
];

/**
 * Analyses spend real inference credit, so they are authenticated and metered.
 * Reads of chain data are not.
 */
export const authSnippet = `# Create a key. It is returned once and stored only as a hash.
curl -X POST http://127.0.0.1:8000/api/v1/keys \\
  -H "Content-Type: application/json" \\
  -d '{ "label": "my laptop" }'

# Analyses require it, and are metered against a daily allowance.
curl "http://127.0.0.1:8000/api/v1/token/0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34" \\
  -H "Authorization: Bearer mk_..."

# Check what is left.
curl http://127.0.0.1:8000/api/v1/keys/me -H "Authorization: Bearer mk_..."`;

export const sdkSnippet = `// No SDK package is published. The API is plain HTTP and JSON.
const response = await fetch(
  "http://127.0.0.1:8000/api/v1/token/0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34",
);

const execution = await response.json();

// Evidence is service-derived and each item carries its source.
for (const item of execution.evidence) {
  console.log(item.label, item.value, item.source);
}

// The summary is model-generated, and says so when no key is configured.
console.log(execution.summary_status, execution.summary);`;

export type ServiceStatus = {
  name: string;
  state: "operational" | "planned";
  detail: string;
};

/**
 * Mirrors what `/api/v1/status` reports. Anything not yet built is marked
 * `planned`, never dressed up as running.
 */
export const serviceStatus: ServiceStatus[] = [
  { name: "Console", state: "operational", detail: "Application shell and routing." },
  { name: "Documentation", state: "operational", detail: "Public reference surface." },
  {
    name: "Execution API",
    state: "operational",
    detail: "Nine agents registered, six implemented; live chain, market, and web data.",
  },
  {
    name: "AI summaries",
    state: "operational",
    detail: "Streamed from Claude Sonnet 5 over collected evidence.",
  },
  {
    name: "Persistence",
    state: "operational",
    detail: "Executions are stored, addressable by URL, and compared run to run.",
  },
  {
    name: "Authentication",
    state: "operational",
    detail:
      "API keys with a daily analysis quota. History is scoped to the key that ran it.",
  },
  {
    name: "Monitoring",
    state: "operational",
    detail:
      "Watched subjects are re-analysed on a schedule and the differences reported. Off unless MONITOR_ENABLED is set.",
  },
  {
    name: "Alert delivery",
    state: "planned",
    detail:
      "An alarming change is written to the log and shown in the console. Nothing emails or messages you yet.",
  },
];
