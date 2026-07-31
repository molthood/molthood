import type { Metadata } from "next";
import { KeyRound } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { phaseOf } from "@/config/roadmap";

export const metadata: Metadata = {
  title: "API keys",
  description:
    "Scoped credentials with per-key allowances, rotation, revocation and an audit trail.",
};

export default function Page() {
  return (
    <ComingSoon
      icon={KeyRound}
      title="API keys"
      description="Scoped credentials with per-key allowances, rotation, revocation and an audit trail."
      phase={phaseOf("api-keys")}
      detail={[
        "A key is how an analysis is metered. Each one carries its own daily allowance, so an integration that runs away cannot spend another's budget, and revoking one leaves the rest untouched.",
        "Keys will be issuable per environment and restrictable by what they may reach — a key for a build step has no business reading your execution history.",
      ]}
      capabilities={[
        "Issue",
        "Rotate",
        "Revoke",
        "Per-key limits",
        "Scopes",
        "Audit trail",
      ]}
    />
  );
}
