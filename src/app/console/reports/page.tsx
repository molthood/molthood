import type { Metadata } from "next";

import { PageHeader } from "@/components/console/page-header";
import { ReportsLive } from "@/components/console/reports-live";

export const metadata: Metadata = {
  title: "Reports",
  description: "Compiled records of completed executions.",
};

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Reports"
        description="A report is compiled when an execution finishes with an AI summary attached to its evidence."
      />
      <ReportsLive />
    </div>
  );
}
