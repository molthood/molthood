import type { Metadata } from "next";
import { Webhook } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { phaseOf } from "@/config/roadmap";

export const metadata: Metadata = {
  title: "Webhooks",
  description:
    "Execution and change events delivered to an endpoint you control.",
};

export default function Page() {
  return (
    <ComingSoon
      icon={Webhook}
      title="Webhooks"
      description="Execution and change events delivered to an endpoint you control."
      phase={phaseOf("webhooks")}
      detail={[
        "Polling for a result that takes a minute wastes both sides of the connection. A monitored subject that changes at 3am should reach your system without anyone watching a screen.",
        "Signed, retried, and with a dead-letter queue you can inspect — a delivery that failed silently is indistinguishable from an event that never happened.",
      ]}
      capabilities={[
        "Signing",
        "Retries",
        "Dead-letter queue",
        "Event filters",
      ]}
    />
  );
}
