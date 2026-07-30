import type { Metadata } from "next";

import {
  Explainer,
  PageHead,
  Panel,
} from "@/components/dashboard/status-badge";

export const metadata: Metadata = { title: "Usage" };

export default function Page() {
  return (
    <div className="flex flex-col gap-8">
      <PageHead title="Usage" status="planned">
        What your integration consumed, and where the time went.
      </PageHead>

      <Explainer what="Request counts, execution volume, error rate, latency, and storage over a window you choose." why="A limit you cannot see is a limit you discover by hitting it." enables={["API requests", "Executions", "Errors", "Latency", "Bandwidth", "Storage"]} />

      <Panel title="Nothing recorded" description="These are the measures that will appear here. Each shows no data rather than a zero — a zero would be a reading, and nothing has been read.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            "API requests",
            "Executions",
            "Errors",
            "Latency",
            "Bandwidth",
            "Storage",
          ].map((metric) => (
            <div
              key={metric}
              className="rounded-lg border border-border bg-surface-raised px-4 py-3.5"
            >
              <p className="text-[11px] font-bold tracking-wide text-muted uppercase">
                {metric}
              </p>
              <p className="mt-1 text-sm font-bold text-muted">No data</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Not available yet" description="No usage is recorded, because nothing is calling the API yet. These figures will be real when it is, and none of them is simulated.">
        <p className="text-xs font-medium text-muted">There is nothing to configure here yet.</p>
      </Panel>
    </div>
  );
}
