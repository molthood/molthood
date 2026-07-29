import type { Metadata } from "next";

import { PageHeader } from "@/components/console/page-header";
import { ProvidersLive } from "@/components/console/providers-live";

export const metadata: Metadata = {
  title: "Providers",
  description: "Every provider, its state, and what would enable the rest.",
};

export default function ProvidersPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Providers"
        description="What this deployment can currently do, read live from the backend. A provider with no API key is not an error — it is switched off, and the row says exactly which variable would switch it on."
      />
      <ProvidersLive />
    </div>
  );
}
