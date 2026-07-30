/**
 * Types mirroring the backend's public contract (`/api/v1`).
 *
 * Kept hand-written rather than generated so the console compiles even when
 * the backend is offline, and so every field the UI depends on is explicit.
 */

export type ExecutionStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type PipelineStage = "input" | "agents" | "engine" | "evidence" | "report";

export type SummaryStatus =
  | "generated"
  | "not_configured"
  | "skipped"
  | "failed"
  | "pending";

export type AnalysisTarget =
  | "token"
  | "wallet"
  | "contract"
  | "project"
  | "site";

/**
 * How firmly a finding is established.
 *
 * `unknown` must never be rendered as a negative result — it means the check
 * could not run, and `reason` says why. Collapsing it into "no" is the exact
 * mistake the backend was rewritten to stop making.
 */
export type EvidenceState = "confirmed" | "refuted" | "unknown";

export type EvidenceItem = {
  id: string;
  stage: PipelineStage;
  kind: string;
  label: string;
  value: unknown;
  source_url: string | null;
  state: EvidenceState;
  reason: string | null;
  created_at: string;
};

export type SourceRef = {
  label: string;
  url: string;
};

export type StageRead = {
  stage: PipelineStage;
  success: boolean;
  summary: string;
  error: string | null;
  duration_ms: number | null;
};

export type TaskRead = {
  id: string;
  sequence: number;
  name: string;
  agent_kind: string | null;
  status: string;
  duration_ms: number | null;
  error: string | null;
};

/** The standard object every execution returns, for every agent. */
export type ExecutionResponse = {
  execution_id: string;
  status: ExecutionStatus;
  stage: PipelineStage;
  target: AnalysisTarget | null;
  address: string | null;
  agents_used: string[];
  services_called: string[];
  summary: string | null;
  summary_status: SummaryStatus;
  summary_detail: string | null;
  summary_model: string | null;
  facts: Record<string, unknown>;
  evidence: EvidenceItem[];
  sources: SourceRef[];
  stages: StageRead[];
  tasks: TaskRead[];
  execution_time_ms: number | null;
  error: string | null;
};

export type RiskSignal = {
  code: string;
  severity: "critical" | "high" | "medium" | "low";
  detail: string;
  weight: number;
};

export type RiskAssessment = {
  score: number;
  level: "low" | "moderate" | "elevated" | "high";
  signals: RiskSignal[];
  signals_count: number;
  basis: string;
};

/**
 * One token position, screened.
 *
 * `score` is null when nothing could be established — not a zero, and not a
 * hundred. `is_upper_bound` says a check did not run, so the real score can
 * only be lower than the one shown; the UI must render it as a ceiling.
 */
export type HoldingScreen = {
  address: string;
  symbol: string | null;
  name: string | null;
  amount: number | null;
  value_usd: number | null;
  explorer_url: string | null;
  score: number | null;
  level: RiskAssessment["level"] | "unscored";
  signals: RiskSignal[];
  checks_run: string[];
  checks_missed: string[];
  is_upper_bound: boolean;
  error: string | null;
};

export type PortfolioFacts = {
  holdings: HoldingScreen[];
  screened: number;
  total_holdings: number;
  flagged: number;
  unscored: number;
  skipped: { address: string; symbol: string | null }[];
};

/**
 * One difference from the previous analysis of the same subject.
 *
 * `alarming` is reserved for a claim that stopped holding, a new risk signal,
 * a falling score, or supply appearing — the four cases worth interrupting a
 * reader for.
 */
export type ChangeItem = {
  kind: string;
  label: string;
  direction:
    | "broke"
    | "recovered"
    | "lost"
    | "restored"
    | "appeared"
    | "cleared"
    | "rose"
    | "fell"
    | "changed";
  severity: "alarming" | "notable" | "informational";
  detail: string;
  before: unknown;
  after: unknown;
};

export type ChangeReport = {
  previous_execution_id: string;
  previous_at: string;
  elapsed_seconds: number;
  total: number;
  alarming: number;
  items: ChangeItem[];
};

export type ChainStats = {
  chain: { id: number; name: string };
  explorer_url: string;
  network: {
    total_blocks: number | null;
    total_addresses: number | null;
    total_transactions: number | null;
    transactions_today: number | null;
    average_block_time_ms: number | null;
    network_utilization_pct: number | null;
    gas_used_today: number | null;
    head_block: number | null;
    gas_price_wei: number | null;
    gas_prices_gwei: { slow: number | null; average: number | null; fast: number | null } | null;
  };
  market: {
    coin_price_usd: number | null;
    market_cap_usd: number | null;
    tvl_usd: number | null;
  };
  executions: ExecutionStats;
};

export type ExecutionStats = {
  total: number;
  succeeded: number;
  failed: number;
  success_rate: number | null;
  avg_duration_ms: number | null;
  summaries_generated: number;
};

export type ChainToken = {
  address: string | null;
  name: string | null;
  symbol: string | null;
  type: string | null;
  holders: number | null;
  price_usd: number | null;
  market_cap_usd: number | null;
  volume_24h_usd: number | null;
  icon_url: string | null;
};

export type AgentSummary = {
  id: string;
  kind: string;
  name: string;
  description: string;
  version: string;
  capabilities: string[];
  implemented: boolean;
  status: "active" | "degraded" | "not_implemented";
  required_services: string[];
  services: AgentService[];
  runs: number;
  succeeded: number;
  failed: number;
  median_duration_ms: number | null;
  last_run_at: string | null;
  targets: AgentTargetCount[];
};

export type AgentService = {
  name: string;
  state: string;
  detail: string | null;
};

export type AgentTargetCount = {
  target: string;
  runs: number;
};

export type AgentListResponse = {
  items: AgentSummary[];
  total: number;
  implemented: number;
};

export type ExecutionRecord = {
  id: string;
  request: string;
  target: AnalysisTarget | null;
  address: string | null;
  status: string;
  stage: string;
  agents_used: string[];
  services_called: string[];
  summary: string | null;
  summary_status: SummaryStatus;
  evidence_count: number;
  sources_count: number;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
};

export type ExecutionListResponse = {
  items: ExecutionRecord[];
  meta: { total: number; page: number; page_size: number };
  persistence: string;
  stats: ExecutionStats;
};

/**
 * A newly issued key. The `key` field is the only time the secret exists
 * outside the caller's own storage — the server keeps a hash and cannot
 * show it again.
 */
export type KeyIssued = {
  key: string;
  hint: string;
  label: string;
  daily_quota: number;
  note: string;
};

export type KeyInfo = {
  hint: string;
  label: string;
  daily_quota: number;
  used_today: number;
  remaining: number;
  resets_at: string;
  is_admin: boolean;
};

/** One subject under observation. */
export type Watch = {
  id: string;
  target: AnalysisTarget;
  address: string | null;
  label: string;
  interval_seconds: number;
  active: boolean;
  last_checked_at: string | null;
  last_execution_id: string | null;
  /** Why the last check could not run — a spent quota, an upstream outage. */
  last_error: string | null;
  checks_run: number;
  changes_seen: number;
  alarms_seen: number;
  last_changes: ChangeReport | Record<string, never>;
  created_at: string;
};

export type WatchListResponse = {
  items: Watch[];
  total: number;
  limit: number;
  /** False when the deployment has monitoring switched off entirely. */
  monitor_running: boolean;
  note: string;
};

export type DependencyStatus = {
  name: string;
  state: "live" | "not_configured" | "unavailable" | "configured";
  detail: string;
};

export type ComponentStatus = {
  name: string;
  ready: boolean;
  detail: string;
};

export type PlatformStatus = {
  status: "ok" | "degraded";
  environment: string;
  version: string;
  uptime_seconds: number;
  timestamp: string;
  agents_registered: number;
  pipelines_registered: number;
  components: ComponentStatus[];
  dependencies: DependencyStatus[];
};

/** The single error envelope every backend failure returns. */
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    suggested_action: string;
    details: Record<string, unknown>;
  };
  request_id: string | null;
};

// --- Capability providers ---------------------------------------------------

/**
 * What a provider can currently do.
 *
 * Six states rather than a boolean, because the reasons differ in what they
 * ask of the reader: `missing_key` is a deployment task, `rate_limited` clears
 * on its own, `unavailable` is somebody else's outage.
 */
export type ProviderState =
  | "healthy"
  | "enabled"
  | "missing_key"
  | "disabled"
  | "rate_limited"
  | "unavailable";

export type ProviderStatus = {
  name: string;
  title: string;
  description: string;
  capabilities: string[];
  state: ProviderState;
  detail: string;
  /** Everything this provider needs. Never the values. */
  required_env: string[];
  /**
   * The subset of `required_env` that is actually unset — what to render.
   * Showing the full list would tell an operator to set a value they already
   * have.
   */
  missing_env: string[];
  optional: boolean;
  base_url: string | null;
  latency_ms: number | null;
  checked_at: string | null;
  version: string | null;
  usable: boolean;
};

export type CapabilityStatus = {
  available: boolean;
  providers: string[];
  /** Variables that would unlock a capability nothing currently serves. */
  enable_with: string[];
};

export type ProviderSnapshot = {
  initialized: boolean;
  total: number;
  usable: number;
  providers: ProviderStatus[];
  capabilities: Record<string, CapabilityStatus>;
  /** "upstash-redis" or "memory" — memory is per-process and not shared. */
  cache_backend: string;
};

export type PlannedStep = {
  capability: string;
  provider: string | null;
  required: boolean;
  description: string;
  skipped_because: string | null;
};

export type WorkflowPlan = {
  kind: string;
  title: string;
  description?: string;
  runnable: boolean;
  blocked_by: string[];
  steps: PlannedStep[];
};

// --- Tasks and reports ------------------------------------------------------

export type Citation = {
  url: string | null;
  title: string | null;
  published_at: string | null;
  provider: string;
  excerpt: string | null;
};

export type ReportEvidence = {
  kind: string;
  label: string;
  value: unknown;
  state: EvidenceState;
  reason: string | null;
  citations: Citation[];
};

export type ArtifactRef = {
  name: string;
  kind: "image" | "data" | "document" | "file";
  size_bytes: number;
  encoding: "utf-8" | "base64";
  content: string;
  produced_by: string;
};

export type ReportStep = {
  capability: string;
  provider: string | null;
  required: boolean;
  description: string;
  ok: boolean | null;
  duration_ms: number | null;
  error: string | null;
  /** Present when the step did not run. Never omitted. */
  skipped_because: string | null;
};

export type ProviderTiming = {
  provider: string;
  capability: string;
  ok: boolean;
  duration_ms: number | null;
  citations: number;
};

export type Report = {
  task_id: string;
  kind: string;
  request: string;
  created_at: string;
  summary: string | null;
  summary_status: string;
  summary_detail: string | null;
  reasoning: string[];
  evidence: ReportEvidence[];
  sources: Citation[];
  artifacts: ArtifactRef[];
  timeline: ReportStep[];
  providers: ProviderTiming[];
  performance: {
    total_ms: number | null;
    provider_ms: number | null;
    steps_run: number;
    steps_skipped: number;
    cache_hit: boolean;
    cache_backend: string | null;
  };
  /**
   * How much of the plan actually ran. `unknown` means nothing was
   * established — never a default that reads as reassurance.
   */
  confidence: "high" | "medium" | "low" | "unknown";
  confidence_reason: string | null;
  /** Variables that would have unlocked a step that could not run. */
  blocked_by: string[];
  warnings: string[];
  error: string | null;
};

// --- Public execution feed --------------------------------------------------

/**
 * One published execution, as a stranger sees it.
 *
 * Deliberately narrow. It carries the *kind* of work and its progress, never
 * the subject and never the providers — an execution records the address
 * somebody asked about, and the feed exists without leaking that.
 */
export type PublicStep = {
  label: string;
  state: "completed" | "running" | "waiting" | "failed";
  duration_ms: number | null;
};

export type PublicExecution = {
  id: string;
  kind: string;
  status: "running" | "completed" | "failed";
  current_step: string;
  steps: PublicStep[];
  /** 0 to 1 across the phases. */
  progress: number;
  started_at: string;
  elapsed_ms: number | null;
  findings: number;
  sources: number;
  artifacts: number;
  has_report: boolean;
};

/** A subject that has been analysed, derived from stored executions. */
export type Subject = {
  target: AnalysisTarget;
  address: string | null;
  runs: number;
  succeeded: number;
  first_seen: string;
  last_seen: string;
  last_execution_id: string;
  last_summary: string | null;
  findings: number;
  risk_score: number | null;
  risk_level: RiskAssessment["level"] | null;
  changes: number;
  alarming: number;
};

export type SubjectListResponse = {
  items: Subject[];
  total: number;
  /** How many have been looked at more than once. */
  revisited: number;
};


/** One section of a rendered report. */
export type ReportSection = {
  heading: string;
  body: string;
};

/**
 * A file an execution produced.
 *
 * `content` is absent from listings on purpose — twenty artifacts must not
 * mean twenty payloads over the wire. Fetch the download URL for bytes.
 */
export type ExecutionArtifact = {
  id: string;
  execution_id: string | null;
  kind: "report" | "data" | "chart" | "image" | "table" | "bundle" | "log";
  filename: string;
  media_type: string;
  size_bytes: number;
  digest: string;
  label: string;
  description: string | null;
  is_text: boolean;
  created_at: string;
};

export type ExecutionReport = {
  title: string;
  sections: ReportSection[];
  artifacts: ExecutionArtifact[];
};

export type ArtifactListResponse = {
  execution_id: string;
  items: ExecutionArtifact[];
  total: number;
};

/** One side of a comparison, reduced to what the verdict rests on. */
export type ComparisonSide = {
  execution_id: string | null;
  label: string;
  target: string | null;
  address: string | null;
  score: number | null;
  level: string | null;
  checks: number;
};

export type SharedCheck = {
  kind: string;
  label: string;
  left: { state: string; value: unknown };
  right: { state: string; value: unknown };
  agrees: boolean;
};

/**
 * A check that could not be compared.
 *
 * Never a difference between the subjects — the difference is in the coverage.
 * Rendering these alongside the shared checks would imply the opposite.
 */
export type IncomparableCheck = {
  kind: string;
  label: string;
  ran_on: "left" | "right" | "both";
  reason: string;
};

export type Comparison = {
  left: ComparisonSide;
  right: ComparisonSide;
  shared: SharedCheck[];
  not_comparable: IncomparableCheck[];
  shared_checks: number;
  /** `null` means no verdict was possible, which is not a tie. */
  verdict: "left" | "right" | "tie" | null;
  verdict_reason: string;
  warnings: string[];
};
