import type { Metadata } from "next";
import { Network } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { phaseOf } from "@/config/roadmap";

export const metadata: Metadata = {
  title: "REST API",
  description: "The engine behind the console, over plain HTTP and JSON.",
};

export default function Page() {
  return (
    <ComingSoon
      icon={Network}
      title="REST API"
      description="The engine behind the console, over plain HTTP and JSON."
      phase={phaseOf("public-api")}
      detail={[
        "One request starts an analysis. The response carries the findings, each with the source it came from and whether it was confirmed, refuted, or could not be established at all.",
        "The routes exist and the reference is written. What is not yet promised is stability: until the contract is frozen, a field may move, and building against it now means accepting that.",
      ]}
      capabilities={[
        "Executions",
        "Reports",
        "Artifacts",
        "Comparisons",
        "Watches",
        "Streaming",
      ]}
    />
  );
}
