import type { Metadata } from "next";

import { HistoryLive } from "@/components/console/history-live";
import { PageHeader } from "@/components/console/page-header";

export const metadata: Metadata = {
  title: "History",
  description: "Timeline of the analyses run with your API key.",
};

export default function HistoryPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="History"
        description="Every analysis run with your API key, newest first. Stored, so it survives a restart — and scoped to your key, so it is only yours."
      />
      <HistoryLive />
    </div>
  );
}
