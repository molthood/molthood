import type { Metadata } from "next";
import { Gauge } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { phaseOf } from "@/config/roadmap";

export const metadata: Metadata = {
  title: "Usage",
  description: "What you have spent, per key, over time.",
};

export default function Page() {
  return (
    <ComingSoon
      icon={Gauge}
      title="Usage"
      description="What you have spent, per key, over time."
      phase={phaseOf("api-keys")}
      detail={[
        "Analyses cost real inference credit and are metered against the key that ran them. This is where that meter becomes visible.",
        "Per-key, per-day, and broken down by what was actually run — so an unexpected bill has an explanation rather than a total.",
      ]}
      capabilities={[
        "Per-key totals",
        "Daily breakdown",
        "Allowance remaining",
      ]}
    />
  );
}
