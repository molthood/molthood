import type { BadgeVariant } from "@/components/ui/badge";
import type {
  AgentStatus,
  ExecutionStatus,
  ProjectStatus,
  ReportCategory,
} from "@/types/console";

/**
 * Single source of truth for how a domain status is presented. Keeping the
 * label and the tone together stops the two drifting apart across pages.
 */
type StatusPresentation = { label: string; variant: BadgeVariant };

export const executionStatus: Record<ExecutionStatus, StatusPresentation> = {
  succeeded: { label: "Succeeded", variant: "success" },
  running: { label: "Running", variant: "info" },
  queued: { label: "Queued", variant: "default" },
  failed: { label: "Failed", variant: "danger" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

export const agentStatus: Record<AgentStatus, StatusPresentation> = {
  active: { label: "Active", variant: "success" },
  idle: { label: "Idle", variant: "default" },
  paused: { label: "Paused", variant: "warning" },
  error: { label: "Error", variant: "danger" },
};

export const projectStatus: Record<ProjectStatus, StatusPresentation> = {
  active: { label: "Active", variant: "success" },
  paused: { label: "Paused", variant: "warning" },
  archived: { label: "Archived", variant: "outline" },
};

export const reportCategoryVariant: Record<ReportCategory, BadgeVariant> = {
  Audit: "info",
  Market: "primary",
  Risk: "warning",
  Deployment: "success",
  Portfolio: "default",
};

export const executionStatusOptions = [
  "All",
  "Succeeded",
  "Running",
  "Queued",
  "Failed",
  "Cancelled",
] as const;

export type ExecutionStatusFilter = (typeof executionStatusOptions)[number];
