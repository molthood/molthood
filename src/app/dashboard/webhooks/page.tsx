import type { Metadata } from "next";

import {
  DisabledAction,
  Explainer,
  PageHead,
  Panel,
} from "@/components/dashboard/status-badge";

export const metadata: Metadata = { title: "Webhooks" };

export default function Page() {
  return (
    <div className="flex flex-col gap-8">
      <PageHead title="Webhooks" status="planned">
        Receive execution events as they happen, signed, instead of polling for them.
      </PageHead>

      <Explainer what="An HTTPS endpoint you own, called when something finishes or changes." why="Polling for a run that takes eight seconds wastes both sides. Polling a watchlist wastes more." enables={["Signed payloads", "Retries", "Delivery log", "Replay", "Per-event subscriptions"]} />

      <Panel title="Not available yet" description="No endpoints can be registered and no events are delivered.">
        <div className="flex flex-wrap gap-2"><DisabledAction label="Add endpoint" /></div>
      </Panel>
    </div>
  );
}
