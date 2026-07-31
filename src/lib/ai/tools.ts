/**
 * The assistant's tools: Molthood's own backend, exposed to the model.
 *
 * Two rules govern everything here.
 *
 * **A tool never throws.** A failure is a value — `{ available: false, reason }`
 * — because a router driving several sources must lose one to a missing key
 * without losing the answer. This mirrors `ProviderResult(ok=False)` in the
 * backend rather than inventing a second convention.
 *
 * **A failure is distinguishable from an empty success.** `missing_key`,
 * `unreachable`, `http_error` and `not_found` are separate reasons, so the
 * model can say *why* it could not check instead of implying it did.
 */

import {
  MOLTHOOD_API_KEY,
  MOLTHOOD_API_URL,
} from "@/lib/ai/config";

export type ToolResult = {
  available: boolean;
  /** Present when `available` is false. Never a free-form sentence. */
  reason?:
    | "missing_key"
    | "rate_limited"
    | "unreachable"
    | "http_error"
    | "not_found"
    | "timeout";
  detail?: string;
  data?: unknown;
};

/** OpenAI-compatible tool schemas. */
export const TOOL_SCHEMAS = [
  {
    type: "function" as const,
    function: {
      name: "chain_overview",
      description:
        "Live Robinhood Chain statistics: block height, gas price, transaction and address totals. Needs no arguments. Use for questions about the network itself.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_token",
      description:
        "Search tokens tracked on Robinhood Chain by ticker or name, returning addresses, holders, price and market cap. Use this first when someone names a token without giving an address.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Ticker or name, e.g. 'HOOD'. Omit to list the most active tokens.",
          },
          limit: { type: "integer", description: "How many to return (1-25).", default: 8 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "analyse_subject",
      description:
        "Run a full Molthood analysis and return its findings: evidence, risk signals and sources. This is the authoritative source for a specific wallet, token, contract or website. Metered — call it once per subject, not repeatedly.",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            enum: ["token", "wallet", "contract", "site", "project"],
            description:
              "'project' analyses Robinhood Chain as a whole and takes no address.",
          },
          address: {
            type: "string",
            description: "0x address for token, wallet and contract targets.",
          },
          url: { type: "string", description: "Website URL or bare domain for the 'site' target." },
        },
        required: ["target"],
        additionalProperties: false,
      },
    },
  },
] as const;

export type ToolName = (typeof TOOL_SCHEMAS)[number]["function"]["name"];

/** Human-readable status for the timeline the UI shows while a tool runs. */
export const TOOL_LABELS: Record<string, string> = {
  chain_overview: "Reading chain statistics",
  find_token: "Searching tracked tokens",
  analyse_subject: "Running a Molthood analysis",
};

const TIMEOUTS: Record<string, number> = {
  chain_overview: 15_000,
  find_token: 15_000,
  // A full analysis runs several agents against live sources.
  analyse_subject: 120_000,
};

async function request(
  path: string,
  { timeout, authed }: { timeout: number; authed: boolean },
): Promise<ToolResult> {
  if (authed && !MOLTHOOD_API_KEY) {
    return {
      available: false,
      reason: "missing_key",
      detail:
        "MOLTHOOD_API_KEY is not set on this deployment, so metered analyses cannot run. Nothing was checked.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${MOLTHOOD_API_URL}/api/v1${path}`, {
      headers: authed ? { "X-API-Key": MOLTHOOD_API_KEY } : {},
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      // Three different things, and the model has to say which. 404 means the
      // subject is not there; 429 means the shared daily allowance is spent
      // and the same question works tomorrow; anything else is a fault.
      // Collapsing them would turn "not checked yet" into "checked, nothing
      // found", which is the failure this codebase exists to avoid.
      const reason =
        response.status === 404
          ? "not_found"
          : response.status === 429
            ? "rate_limited"
            : "http_error";
      return {
        available: false,
        reason,
        detail:
          reason === "rate_limited"
            ? "Molt AI's shared daily analysis allowance is spent. Nothing was checked."
            : `The Molthood API answered ${response.status}.`,
      };
    }

    return { available: true, data: await response.json() };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      available: false,
      reason: aborted ? "timeout" : "unreachable",
      detail: aborted
        ? "The analysis did not finish in time. It may still be running."
        : "The Molthood API could not be reached.",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Trims an execution down to what the model can use without drowning in it. */
function summariseExecution(data: unknown): unknown {
  if (typeof data !== "object" || data === null) return data;
  const record = data as Record<string, unknown>;

  return {
    id: record.id,
    target: record.target,
    status: record.status,
    subject: record.subject,
    risk: record.risk,
    score: record.score,
    findings: record.findings,
    evidence: record.evidence,
    sources: record.sources,
    summary: record.summary,
    summary_status: record.summary_status,
    // Kept even when empty: an execution that skipped checks is the case the
    // model most needs to see, and dropping the field hides it.
    skipped: record.skipped,
  };
}

export async function runTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const timeout = TIMEOUTS[name] ?? 20_000;

  if (name === "chain_overview") {
    return request("/chain/stats", { timeout, authed: false });
  }

  if (name === "find_token") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 25);
    const search = new URLSearchParams({ limit: String(limit) });
    if (query) search.set("q", query);
    return request(`/chain/tokens?${search}`, { timeout, authed: false });
  }

  if (name === "analyse_subject") {
    const target = String(args.target ?? "");
    const address = typeof args.address === "string" ? args.address.trim() : "";
    const url = typeof args.url === "string" ? args.url.trim() : "";

    let path: string;
    if (target === "project") {
      path = "/project";
    } else if (target === "site") {
      if (!url) {
        return {
          available: false,
          reason: "not_found",
          detail: "A website target needs a URL.",
        };
      }
      path = `/site?url=${encodeURIComponent(url)}`;
    } else if (["token", "wallet", "contract"].includes(target)) {
      if (!address) {
        return {
          available: false,
          reason: "not_found",
          detail: `A ${target} target needs a 0x address.`,
        };
      }
      path = `/${target}/${encodeURIComponent(address)}`;
    } else {
      return {
        available: false,
        reason: "not_found",
        detail: `Unknown target "${target}".`,
      };
    }

    const result = await request(path, { timeout, authed: true });
    return result.available
      ? { ...result, data: summariseExecution(result.data) }
      : result;
  }

  return {
    available: false,
    reason: "not_found",
    detail: `No tool named "${name}".`,
  };
}
