import type { Metadata } from "next";

import { ExecutionsLive } from "@/components/console/executions-live";
import { PageHeader } from "@/components/console/page-header";

export const metadata: Metadata = {
  title: "Executions",
  description: "Run and inspect real executions against Robinhood Chain.",
};

export default function ExecutionsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Executions"
        description="Submit a request and watch it run through the pipeline: router, service layer, evidence collection, then AI summary."
      />
      <ExecutionsLive />
    </div>
  );
}
