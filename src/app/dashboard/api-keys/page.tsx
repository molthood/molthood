import type { Metadata } from "next";

import {
  DisabledAction,
  Explainer,
  PageHead,
  Panel,
} from "@/components/dashboard/status-badge";

export const metadata: Metadata = { title: "API keys" };

export default function Page() {
  return (
    <div className="flex flex-col gap-8">
      <PageHead title="API keys" status="planned">
        Scoped credentials for reaching the Molthood API from your own code, with rotation and an audit trail.
      </PageHead>

      <Explainer what="A key authorises requests and defines what they may reach. One per environment, revocable independently." why="A single shared secret cannot be rotated without coordinating every consumer, and cannot be narrowed when one of them only needs to read." enables={["Create key", "Rotate", "Revoke", "Scopes", "Rate limits", "Expiry", "Usage", "Audit log"]} />

      <Panel title="Not available yet" description="No keys exist yet, and none can be generated. The key the console uses for analyses today is separate and unaffected.">
        <div className="flex flex-wrap gap-2"><DisabledAction label="Create key" /><DisabledAction label="Rotate" /><DisabledAction label="Revoke" /></div>
      </Panel>
    </div>
  );
}
