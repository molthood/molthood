import type { Metadata } from "next";

import { ComparePicker } from "@/components/console/comparison-view";
import { PageHeader } from "@/components/console/page-header";

export const metadata: Metadata = {
  title: "Compare",
  description: "Two subjects side by side, with what could not be compared named.",
};

export default function ComparePage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Compare"
        description="Two different subjects at the same moment. Checks that only one side ran are listed apart from the rest — the difference there is in the coverage, not in the subjects, and a verdict is withheld entirely when too little is shared."
      />
      <ComparePicker />
    </div>
  );
}
