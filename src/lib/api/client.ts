/**
 * Typed client for the Molthood backend.
 *
 * Every failure — network, HTTP, or malformed body — becomes an `ApiError`
 * carrying a code, a message, and a suggested action, so the UI can always
 * render something meaningful instead of a raw exception.
 */

import { authHeaders } from "@/lib/api/credentials";
import type {
  AgentListResponse,
  AnalysisTarget,
  ApiErrorBody,
  ChainStats,
  ChainToken,
  ExecutionListResponse,
  ExecutionResponse,
  KeyInfo,
  KeyIssued,
  PlatformStatus,
  ProviderSnapshot,
  PublicExecution,
  Report,
  SubjectListResponse,
  Watch,
  WatchListResponse,
  WorkflowPlan,
  ArtifactListResponse,
  Comparison,
  ExecutionReport,
} from "@/lib/api/types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const API_PREFIX = "/api/v1";

/** A backend failure, already shaped for display. */
export class ApiError extends Error {
  readonly code: string;
  readonly suggestedAction: string;
  readonly status: number;
  readonly requestId: string | null;

  constructor(init: {
    code: string;
    message: string;
    suggestedAction: string;
    status: number;
    requestId?: string | null;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.code = init.code;
    this.suggestedAction = init.suggestedAction;
    this.status = init.status;
    this.requestId = init.requestId ?? null;
  }

  /** True when the backend simply is not running — the common local case. */
  get isOffline(): boolean {
    return this.code === "network_unreachable";
  }

  /** No key, or one the server no longer accepts. The console shows setup. */
  get needsKey(): boolean {
    return this.status === 401 || this.code === "authentication_required";
  }

  /**
   * The daily analysis allowance is spent.
   *
   * Distinct from `isRateLimited`: waiting a few seconds will not help, so the
   * UI must not offer a retry that is guaranteed to fail.
   */
  get isQuotaExceeded(): boolean {
    return this.code === "quota_exceeded";
  }

  get isRateLimited(): boolean {
    return this.code === "rate_limited";
  }
}

function offlineError(detail: string): ApiError {
  return new ApiError({
    code: "network_unreachable",
    message: "Cannot reach the Molthood API.",
    suggestedAction: `Start the backend with \`uvicorn app.main:app\` and confirm it is on ${API_BASE_URL}. (${detail})`,
    status: 0,
  });
}

type RequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Client-side timeout, so a hung request cannot freeze the UI. */
  timeoutMs?: number;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal, timeoutMs = 30_000 } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Abort if either the caller or our own timeout fires.
  signal?.addEventListener("abort", () => controller.abort(), { once: true });

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
      method,
      headers: {
        // Read per request rather than captured once, so pasting a key takes
        // effect immediately instead of after a reload.
        ...authHeaders(),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError({
        code: "request_timeout",
        message: "The request took too long.",
        suggestedAction: "Retry. The chain or explorer may be responding slowly.",
        status: 0,
      });
    }
    throw offlineError(error instanceof Error ? error.message : "unknown");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let payload: ApiErrorBody | null = null;
    try {
      payload = (await response.json()) as ApiErrorBody;
    } catch {
      // Body was not the standard envelope; fall through to a generic error.
    }

    throw new ApiError({
      code: payload?.error.code ?? "http_error",
      message: payload?.error.message ?? `Request failed (${response.status}).`,
      suggestedAction:
        payload?.error.suggested_action ?? "Retry, or check the API logs.",
      status: response.status,
      requestId: payload?.request_id ?? null,
    });
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError({
      code: "invalid_response",
      message: "The API returned a body we could not read.",
      suggestedAction: "Retry. If it persists, check the API version.",
      status: response.status,
    });
  }
}

export const api = {
  status: (signal?: AbortSignal) =>
    request<PlatformStatus>("/status", { signal }),

  chainStats: (signal?: AbortSignal) =>
    request<ChainStats>("/chain/stats", { signal }),

  /** `query` searches by ticker or name — how a subject is found at all. */
  chainTokens: (limit = 12, query?: string, signal?: AbortSignal) =>
    request<{ items: ChainToken[]; total: number }>(
      `/chain/tokens?limit=${limit}${query ? `&q=${encodeURIComponent(query)}` : ""}`,
      { signal },
    ),

  agents: (signal?: AbortSignal) =>
    request<AgentListResponse>("/agents", { signal }),

  executions: (signal?: AbortSignal) =>
    request<ExecutionListResponse>("/executions?page_size=50", { signal }),

  /** Analyses can take several seconds; they get a longer budget. */
  execute: (body: { request: string; metadata?: Record<string, unknown> }) =>
    request<ExecutionResponse>("/execute", {
      method: "POST",
      body,
      timeoutMs: 90_000,
    }),

  analyzeToken: (address: string) =>
    request<ExecutionResponse>(`/token/${address}`, { timeoutMs: 90_000 }),

  analyzeWallet: (address: string) =>
    request<ExecutionResponse>(`/wallet/${address}`, { timeoutMs: 90_000 }),

  analyzeContract: (address: string) =>
    request<ExecutionResponse>(`/contract/${address}`, { timeoutMs: 90_000 }),

  analyzeProject: () =>
    request<ExecutionResponse>("/project", { timeoutMs: 90_000 }),

  /** Off-chain: the target is a URL or bare domain rather than an address. */
  analyzeSite: (url: string) =>
    request<ExecutionResponse>(`/site?url=${encodeURIComponent(url)}`, {
      timeoutMs: 90_000,
    }),

  /**
   * A stored result, in full.
   *
   * Reads the analysis as it was recorded rather than re-running it, so a
   * shared link shows the findings that were actually made and not a fresh
   * run against a chain that has since moved.
   */
  executionResult: (id: string, signal?: AbortSignal) =>
    request<ExecutionResponse>(`/executions/${encodeURIComponent(id)}/result`, {
      signal,
    }),

  /**
   * Mint a key. The only call that returns a secret, and the only one that
   * works without already having one.
   */
  createKey: (label: string) =>
    request<KeyIssued>("/keys", { method: "POST", body: { label } }),

  /** Quota and usage for the key currently stored. */
  keyInfo: (signal?: AbortSignal) => request<KeyInfo>("/keys/me", { signal }),

  /** Subjects you have analysed, grouped. Derived, not separately stored. */
  subjects: (signal?: AbortSignal) =>
    request<SubjectListResponse>("/executions/subjects", { signal }),

  // --- Capability providers ---
  //
  // Readable without a credential: a caller deciding whether to authenticate
  // needs to know first whether the capability they want exists here.

  providers: (refresh = false, signal?: AbortSignal) =>
    request<ProviderSnapshot>(`/providers${refresh ? "?refresh=true" : ""}`, {
      signal,
      timeoutMs: 45_000,
    }),

  workflows: (signal?: AbortSignal) =>
    request<{ items: WorkflowPlan[] }>("/providers/workflows", { signal }),

  /**
   * The public feed. The one call that needs no credential — it carries only
   * what an execution's owner chose to publish.
   */
  publicFeed: (limit = 6, signal?: AbortSignal) =>
    request<PublicExecution[]>(`/feed?limit=${limit}`, { signal }),

  // --- Tasks ---

  /** Runs the workflow. Costs one unit of the key's daily allowance. */
  runTask: (prompt: string, useCache = true) =>
    request<Report>("/tasks", {
      method: "POST",
      body: { request: prompt, use_cache: useCache },
      timeoutMs: 240_000,
    }),

  task: (taskId: string, signal?: AbortSignal) =>
    request<Report>(`/tasks/${encodeURIComponent(taskId)}`, { signal }),

  // --- Watchlist ---

  watches: (signal?: AbortSignal) =>
    request<WatchListResponse>("/watches", { signal }),

  watch: (body: {
    target: AnalysisTarget;
    address?: string | null;
    label?: string;
    interval_seconds?: number;
  }) =>
    request<{ watch: Watch; interval_seconds: number; interval_was_floored: boolean }>(
      "/watches",
      { method: "POST", body },
    ),

  unwatch: (id: string) =>
    request<{ id: string; deleted: boolean }>(
      `/watches/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),

  pauseWatch: (id: string, paused: boolean) =>
    request<{ id: string; active: boolean }>(
      `/watches/${encodeURIComponent(id)}/${paused ? "pause" : "resume"}`,
      { method: "POST" },
    ),

  report: (executionId: string, signal?: AbortSignal) =>
    request<ExecutionReport>(
      `/reports/${encodeURIComponent(executionId)}`,
      { signal },
    ),

  artifacts: (executionId: string, signal?: AbortSignal) =>
    request<ArtifactListResponse>(
      `/reports/${encodeURIComponent(executionId)}/artifacts`,
      { signal },
    ),

  compare: (executionId: string, otherId: string, signal?: AbortSignal) =>
    request<Comparison>(
      `/reports/${encodeURIComponent(executionId)}/compare/${encodeURIComponent(otherId)}`,
      { signal },
    ),
};

/**
 * Where an artifact's bytes live.
 *
 * Built rather than fetched: the download is a plain link the browser follows,
 * so it renders markdown inline and saves a bundle — which a JSON envelope
 * around base64 could never do.
 */
export function artifactUrl(
  executionId: string,
  filename: string,
  { download = false }: { download?: boolean } = {},
): string {
  const base = `${API_BASE_URL}${API_PREFIX}/reports/${encodeURIComponent(executionId)}/artifacts/${encodeURIComponent(filename)}`;
  return download ? `${base}?download=true` : base;
}
