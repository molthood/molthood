import type { Metadata } from "next";
import { Puzzle } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { phaseOf } from "@/config/roadmap";

export const metadata: Metadata = {
  title: "Skills",
  description:
    "Named, versioned workflows: package a sequence you run often, install one somebody else built.",
};

export default function Page() {
  return (
    <ComingSoon
      icon={Puzzle}
      title="Skills"
      description="Named, versioned workflows: package a sequence you run often, install one somebody else built."
      phase={phaseOf("skills")}
      detail={[
        "Most analysis is repetition with the subject swapped. A skill turns that repetition into something shareable rather than something rebuilt each time.",
        "Versioned, so a workflow that changes underneath you is a decision you make rather than a surprise you discover.",
      ]}
      capabilities={["Install", "Publish", "Version", "Share", "Categories"]}
    />
  );
}
