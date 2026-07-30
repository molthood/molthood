import type { Metadata } from "next";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export const metadata: Metadata = {
  // `absolute` on the default, because the root layout also applies a
  // template — without it the suffix lands twice and the tab reads
  // "Developers — Molthood — Molthood".
  title: {
    absolute: "Developers — Molthood",
    template: "%s — Molthood Developers",
  },
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
