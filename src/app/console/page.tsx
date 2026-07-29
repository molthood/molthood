import type { Metadata } from "next";
import Link from "next/link";
import { Play } from "lucide-react";

import { LiveDashboard } from "@/components/console/live-dashboard";
import { PageHeader } from "@/components/console/page-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Home",
  description: "Live Robinhood Chain activity and platform status.",
};

export default function ConsoleHomePage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Home"
        description="Live network state read directly from Robinhood Chain, plus the health of every service the platform depends on."
        actions={
          <Button asChild size="sm">
            <Link href="/executions">
              <Play aria-hidden="true" />
              Run analysis
            </Link>
          </Button>
        }
      />
      <LiveDashboard />
    </div>
  );
}
