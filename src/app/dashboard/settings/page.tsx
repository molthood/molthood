import type { Metadata } from "next";

import {
  DisabledAction,
  Explainer,
  PageHead,
  Panel,
} from "@/components/dashboard/status-badge";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <div className="flex flex-col gap-8">
      <PageHead title="Settings" status="planned">
        Organisation, team, billing, and security for the developer platform.
      </PageHead>

      <Explainer what="Where a team's shared configuration will live, separate from an individual key." why="A platform used by more than one person needs an owner, a member list, and somewhere the bill goes." enables={["Organisation", "Team", "Billing", "Tokens", "Security", "Notifications"]} />

      <Panel title="Not available yet" description="There are no organisations yet. Molthood is used through a single key per person today.">
        <div className="flex flex-wrap gap-2"><DisabledAction label="Invite member" /><DisabledAction label="Manage billing" /></div>
      </Panel>
    </div>
  );
}
