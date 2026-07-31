import type { Metadata } from "next";
import { Settings2 } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { phaseOf } from "@/config/roadmap";

export const metadata: Metadata = {
  title: "Settings",
  description: "Account, workspace and delivery preferences.",
};

export default function Page() {
  return (
    <ComingSoon
      icon={Settings2}
      title="Settings"
      description="Account, workspace and delivery preferences."
      phase={phaseOf("api-keys")}
      detail={[
        "There is no account system yet — analyses are scoped to an API key rather than to a person, and a settings page without an identity to configure would be a form with nothing behind it.",
        "It arrives with accounts, which is also when notification preferences and team access start to mean something.",
      ]}
      capabilities={["Profile", "Workspace", "Notifications", "Team access"]}
    />
  );
}
