import type { Metadata } from "next";

import { ExecutionDetailLive } from "@/components/console/execution-detail-live";
import { PageHeader } from "@/components/console/page-header";

export const metadata: Metadata = {
  title: "Execution",
  description: "A stored analysis, with its evidence and sources.",
};

/**
 * A permalink for one analysis.
 *
 * Dynamic because the id is only known at request time; the component reads
 * the stored result, so this renders what the run found rather than starting
 * a new one.
 */
export default async function ExecutionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Execution"
        description="Evidence and sources exactly as this analysis recorded them. Share the link — it will show the same findings later."
      />
      <ExecutionDetailLive executionId={id} />
    </div>
  );
}
