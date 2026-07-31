import type { Metadata } from "next";
import { Route } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { phaseOf } from "@/config/roadmap";

export const metadata: Metadata = {
  title: "Endpoints",
  description:
    "Every route, its method, its authentication, and what it returns.",
};

export default function Page() {
  return (
    <ComingSoon
      icon={Route}
      title="Endpoints"
      description="Every route, its method, its authentication, and what it returns."
      phase={phaseOf("public-api")}
      detail={[
        "A browsable index of the API surface, generated from the same definitions the server uses — so it cannot drift from what actually answers.",
        "Until the contract is stable this lives in the documentation rather than as an interactive console, because a try-it button implies a promise the API has not made yet.",
      ]}
      capabilities={["Reference", "Auth requirements", "Schemas", "Examples"]}
    />
  );
}
