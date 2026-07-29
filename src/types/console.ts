import type { LucideIcon } from "lucide-react";

/** Lifecycle of a single execution as it moves through the pipeline. */
export type ExecutionStatus =
  | "succeeded"
  | "running"
  | "queued"
  | "failed"
  | "cancelled";

/** Operational state of an agent within the workspace. */
export type AgentStatus = "active" | "idle" | "paused" | "error";

export type ProjectStatus = "active" | "paused" | "archived";

export type ReportCategory =
  | "Audit"
  | "Market"
  | "Risk"
  | "Deployment"
  | "Portfolio";

/** Maps a domain status onto a visual tone so colour stays consistent. */
export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "primary";

export type Agent = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  status: AgentStatus;
  capabilities: string[];
  version: string;
  totalExecutions: number;
  successRate: number;
  avgRuntimeMs: number;
  lastRunAt: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  executionCount: number;
  agentIds: string[];
  lastExecutionId: string;
  lastExecutionAt: string;
  updatedAt: string;
};

export type Execution = {
  id: string;
  agentId: string;
  agentName: string;
  request: string;
  status: ExecutionStatus;
  startedAt: string;
  durationMs: number | null;
  result: string;
  projectId: string | null;
};

export type Report = {
  id: string;
  title: string;
  category: ReportCategory;
  createdAt: string;
  preview: string;
  executionId: string;
  pageCount: number;
};

export type HistoryEventKind =
  | "execution.completed"
  | "execution.failed"
  | "execution.started"
  | "report.generated"
  | "agent.paused"
  | "project.created";

export type HistoryEvent = {
  id: string;
  kind: HistoryEventKind;
  title: string;
  description: string;
  actor: string;
  occurredAt: string;
  reference: string;
};

export type Stat = {
  id: string;
  label: string;
  value: string;
  /** Signed percentage change against the previous period. */
  delta: number | null;
  deltaLabel: string;
  icon: LucideIcon;
  /** Sparkline series, normalised at render time. */
  series: number[];
};

export type NotificationItem = {
  id: string;
  title: string;
  description: string;
  occurredAt: string;
  tone: Tone;
  unread: boolean;
};
