import type { Metadata } from "next";

import { PageHeader } from "@/components/console/page-header";
import { SettingsView } from "@/components/console/settings-view";

export const metadata: Metadata = {
  title: "Settings",
  description: "Workspace, network, and access preferences.",
};

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Settings"
        description="Profile, workspace, and delivery preferences. Validation is live; persistence arrives with the backend in a later phase."
      />
      <SettingsView />
    </div>
  );
}
