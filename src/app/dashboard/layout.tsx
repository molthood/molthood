import type { Metadata } from "next";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export const metadata: Metadata = {
  title: { default: "Developers — Molthood", template: "%s — Molthood Developers" },
  description:
    "The Molthood developer platform: REST API, keys, CLI, SDK, MCP server, skills, and webhooks.",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
