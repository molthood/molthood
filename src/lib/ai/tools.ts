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

/**
 * Where a finding came from, named by role.
 *
 * Roles rather than suppliers, and the URL alongside — the link is what makes
 * a claim checkable, and it says who served it without the interface having to.
 */
export type SourceRef = { role: string; url?: string };

export type ToolResult = {
  available: boolean;
  /** Roles consulted, for the sources panel. */
  sources?: SourceRef[];
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
      name: "explain_transaction",
      description:
        "Look up one Robinhood Chain transaction and its outcome: whether it succeeded or reverted, who sent it, what it called, value moved and gas used.",
      parameters: {
        type: "object",
        properties: {
          hash: { type: "string", description: "0x followed by 64 hex characters." },
        },
        required: ["hash"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "inspect_repository",
      description:
        "Read a public GitHub repository's live facts: stars, forks, open issues, licence, primary language, and when it was last pushed to. Use for any github.com link or owner/repo reference.",
      parameters: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Either 'owner/name' or just 'owner' for the account itself.",
          },
        },
        required: ["repo"],
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
/**
 * What a tool did, named for a reader rather than for the codebase.
 *
 * `analyse_subject` becomes "Token Analysis" or "Wallet Analysis" depending on
 * what it was pointed at — one function, several jobs, and the badge should
 * say the job.
 */
export function badgesFor(name: string, args: Record<string, unknown>): string[] {
  if (name === "analyse_subject") {
    const target = String(args.target ?? "");
    const byTarget: Record<string, string[]> = {
      token: ["Token Analysis", "Security Scan", "Market Data"],
      wallet: ["Wallet Analysis", "Portfolio"],
      contract: ["Contract Analysis", "Security Scan"],
      site: ["Website Research", "Research"],
      project: ["On-chain Analysis"],
    };
    return byTarget[target] ?? ["Analysis"];
  }
  if (name === "explain_transaction") return ["Transactions", "On-chain Analysis"];
  if (name === "inspect_repository") return ["GitHub"];
  if (name === "find_token") return ["Market Data"];
  if (name === "chain_overview") return ["On-chain Analysis"];
  return [];
}

export const TOOL_LABELS: Record<string, string> = {
  chain_overview: "Reading chain statistics",
  find_token: "Searching tracked tokens",
  explain_transaction: "Reading the transaction",
  inspect_repository: "Reading the repository",
  analyse_subject: "Running a full analysis",
};

const TIMEOUTS: Record<string, number> = {
  chain_overview: 15_000,
  find_token: 15_000,
  explain_transaction: 20_000,
  inspect_repository: 15_000,
  // A full analysis runs several agents against live sources.
  analyse_subject: 120_000,
};

async function request(
  path: string,
  {
    timeout,
    authed,
    sources = [],
  }: { timeout: number; authed: boolean; sources?: SourceRef[] },
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
      // Bearer, not `X-API-Key`. The backend mounts `HTTPBearer`, so the
      // other header is simply absent and every call came back 401 — with the
      // key correctly set, which is what made it look like a key problem.
      headers: authed ? { Authorization: `Bearer ${MOLTHOOD_API_KEY}` } : {},
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
            ? "Molthood Agent's shared daily analysis allowance is spent. Nothing was checked."
            : `The Molthood API answered ${response.status}.`,
      };
    }

    return { available: true, data: await response.json(), sources };
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

/**
 * Trims an execution down to what the model can use without drowning in it.
 *
 * Named against the response schema rather than against what a report *ought*
 * to contain: the first version picked `findings`, `risk`, `score` and
 * `subject`, none of which exist. `JSON.stringify` drops undefined keys
 * silently, so the model simply never received the facts — including the risk
 * signals — and the answers still looked plausible because the evidence list
 * carries enough to fill the gap. A field that is absent by accident and a
 * field that is absent because nothing was found are indistinguishable here,
 * which is the whole problem this codebase is organised around.
 */
function summariseExecution(data: unknown): unknown {
  if (typeof data !== "object" || data === null) return data;
  const record = data as Record<string, unknown>;

  return {
    execution_id: record.execution_id,
    target: record.target,
    address: record.address,
    status: record.status,
    // Where the score and the risk signals live.
    facts: record.facts,
    evidence: record.evidence,
    sources: record.sources,
    summary: record.summary,
    // `not_configured` means no summary was generated, which is different from
    // an analysis that found nothing worth saying.
    summary_status: record.summary_status,
    // Per-stage outcomes. A skipped or failed stage is the case the model most
    // needs to see, so it is carried even when everything succeeded.
    stages: record.stages,
    error: record.error,
  };
}

export async function runTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const timeout = TIMEOUTS[name] ?? 20_000;

  if (name === "chain_overview") {
    return request("/chain/stats", {
      timeout,
      authed: false,
      sources: [{ role: "Chain explorer" }, { role: "Chain node" }],
    });
  }

  if (name === "explain_transaction") {
    const hash = typeof args.hash === "string" ? args.hash.trim() : "";
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      return {
        available: false,
        reason: "not_found",
        detail: "A transaction hash is 0x followed by 64 hex characters.",
      };
    }
    return request(`/chain/transaction/${hash}`, {
      timeout,
      authed: false,
      sources: [{ role: "Chain node" }],
    });
  }

  if (name === "inspect_repository") {
    return inspectRepository(typeof args.repo === "string" ? args.repo : "", timeout);
  }

  if (name === "find_token") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 25);
    const search = new URLSearchParams({ limit: String(limit) });
    if (query) search.set("q", query);
    return request(`/chain/tokens?${search}`, {
      timeout,
      authed: false,
      sources: [{ role: "Chain explorer" }],
    });
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

    const result = await request(path, {
      timeout,
      authed: true,
      sources: [
        { role: "Chain explorer" },
        { role: "Market data" },
        { role: "Security screening" },
      ],
    });
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


/**
 * A public GitHub repository, read directly.
 *
 * Direct rather than through the analysis engine because the engine has no
 * repository capability, and routing a github.com link through the website
 * audit would return facts about a web page — its certificates, its meta tags
 * — when the question was about the code.
 *
 * Unauthenticated: public repository metadata needs no token, and adding one
 * would make a feature that works everywhere depend on a credential.
 */
async function inspectRepository(reference: string, timeout: number): Promise<ToolResult> {
  const path = reference
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");

  if (!/^[\w.-]+(\/[\w.-]+)?$/.test(path)) {
    return {
      available: false,
      reason: "not_found",
      detail: "That does not look like a GitHub owner or owner/repository.",
    };
  }

  const isRepo = path.includes("/");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const sources: SourceRef[] = [
    { role: "Source repository", url: `https://github.com/${path}` },
  ];

  try {
    const response = await fetch(
      `https://api.github.com/${isRepo ? "repos" : "users"}/${path}`,
      {
        headers: { Accept: "application/vnd.github+json" },
        signal: controller.signal,
        cache: "no-store",
      },
    );

    if (response.status === 404) {
      // A real answer: the repository is private, renamed, or was never
      // there. Worth saying, and worth distinguishing from a fetch that broke.
      return {
        available: false,
        reason: "not_found",
        detail: `No public repository or account at ${path}. It may be private or renamed.`,
      };
    }
    if (response.status === 403) {
      return {
        available: false,
        reason: "rate_limited",
        detail: "The repository host is rate limiting unauthenticated reads right now.",
      };
    }
    if (!response.ok) {
      return { available: false, reason: "http_error", detail: `Answered ${response.status}.` };
    }

    const body = (await response.json()) as Record<string, unknown>;

    const data = isRepo
      ? {
          kind: "repository",
          full_name: body.full_name,
          description: body.description,
          stars: body.stargazers_count,
          forks: body.forks_count,
          open_issues: body.open_issues_count,
          language: body.language,
          license: (body.license as { spdx_id?: string } | null)?.spdx_id ?? null,
          // The single most informative field here. A repository last pushed
          // to two years ago is a different claim from its star count.
          pushed_at: body.pushed_at,
          created_at: body.created_at,
          archived: body.archived,
          is_fork: body.fork,
          homepage: body.homepage,
          topics: body.topics,
        }
      : {
          kind: "account",
          login: body.login,
          name: body.name,
          bio: body.bio,
          public_repos: body.public_repos,
          followers: body.followers,
          created_at: body.created_at,
          blog: body.blog,
        };

    return { available: true, data, sources };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      available: false,
      reason: aborted ? "timeout" : "unreachable",
      detail: "The repository host could not be reached.",
    };
  } finally {
    clearTimeout(timer);
  }
}
