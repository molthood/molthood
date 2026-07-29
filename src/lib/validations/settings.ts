import { z } from "zod";

/**
 * Settings schemas. Phase 2 validates and reflects form state only — there is
 * these preferences are not stored anywhere yet — only the API key is.
 */
export const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must be at least 2 characters.")
    .max(48, "Display name must be 48 characters or fewer."),
  handle: z
    .string()
    .trim()
    .min(2, "Handle must be at least 2 characters.")
    .max(24, "Handle must be 24 characters or fewer.")
    .regex(/^[a-z0-9_]+$/i, "Use letters, numbers, and underscores only."),
  email: z.string().trim().email("Enter a valid email address."),
  timezone: z.string().min(1, "Select a timezone."),
});

export type ProfileSettings = z.infer<typeof profileSchema>;

export const workspaceSchema = z.object({
  workspaceName: z
    .string()
    .trim()
    .min(2, "Workspace name must be at least 2 characters.")
    .max(40, "Workspace name must be 40 characters or fewer."),
  slug: z
    .string()
    .trim()
    .min(2, "Slug must be at least 2 characters.")
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only."),
  maxConcurrency: z.coerce
    .number()
    .int()
    .min(1, "At least one concurrent execution is required.")
    .max(10, "Concurrency is capped at 10 during the preview."),
  requireApproval: z.boolean(),
});

export type WorkspaceSettings = z.infer<typeof workspaceSchema>;

export const notificationSchema = z.object({
  executionCompleted: z.boolean(),
  executionFailed: z.boolean(),
  reportGenerated: z.boolean(),
  agentStateChanged: z.boolean(),
  weeklyDigest: z.boolean(),
});

export type NotificationSettings = z.infer<typeof notificationSchema>;

export const timezones = [
  "UTC",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
] as const;

export const profileDefaults: ProfileSettings = {
  displayName: "Dimas Putra",
  handle: "dimas",
  email: "operator@molthood.org",
  timezone: "Asia/Jakarta",
};

export const workspaceDefaults: WorkspaceSettings = {
  workspaceName: "Molthood Workspace",
  slug: "molthood-workspace",
  maxConcurrency: 3,
  requireApproval: true,
};

export const notificationDefaults: NotificationSettings = {
  executionCompleted: true,
  executionFailed: true,
  reportGenerated: true,
  agentStateChanged: false,
  weeklyDigest: false,
};
