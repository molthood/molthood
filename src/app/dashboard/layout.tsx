import type { Metadata } from "next";

import { ComingSoonSurface } from "@/components/dashboard/coming-soon-surface";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DASHBOARD_ENABLED } from "@/config/flags";

export const metadata: Metadata = {
  // `absolute` on the default, because the root layout also applies a
  // template — without it the suffix lands twice and the tab reads
  // "Developers — Molthood — Molthood".
  title: {
    absolute: "Developers — Molthood",
    template: "%s — Molthood Developers",
  },
  description:
    "The Molthood developer platform — REST API, keys, CLI, SDK, MCP server, skills and webhooks — is currently under development.",
};

/**
 * The gate for the whole developer platform.
 *
 * Placed on the layout rather than on each page, because every `/dashboard`
 * route renders through here — there is no page that can be reached around it,
 * and no list of routes to keep in step with the flag.
 *
 * `children` is simply not rendered while the flag is off. The pages, their
 * components and their metadata all still exist and still type-check with the
 * rest of the product, which is what stops them rotting while they wait.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!DASHBOARD_ENABLED) return <ComingSoonSurface />;

  return <DashboardShell>{children}</DashboardShell>;
}
