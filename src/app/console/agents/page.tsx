import type { Metadata } from "next";

import { AgentsLive } from "@/components/console/agents-live";
import { PageHeader } from "@/components/console/page-header";

export const metadata: Metadata = {
  title: "Agents",
  description: "The live agent registry.",
};

export default function AgentsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Agents"
        description="Read live from the running backend. Status reflects the health of each agent's required services, not stored metrics."
      />
      <AgentsLive />
    </div>
  );
}
