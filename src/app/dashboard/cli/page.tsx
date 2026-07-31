import type { Metadata } from "next";
import { Terminal } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { phaseOf } from "@/config/roadmap";

export const metadata: Metadata = {
  title: "CLI",
  description:
    "Drive executions, stream them, and pull artifacts from a terminal.",
};

export default function Page() {
  return (
    <ComingSoon
      icon={Terminal}
      title="CLI"
      description="Drive executions, stream them, and pull artifacts from a terminal."
      phase={phaseOf("cli")}
      detail={[
        "Scripting an analysis into a build step or a scheduled job should not require writing an HTTP client first.",
        "The same output the console renders, as text a pipeline can read — exit codes that mean something, and reports that can be written straight to a file.",
      ]}
      capabilities={[
        "Run",
        "Watch",
        "Stream",
        "Export",
        "CI-friendly exit codes",
      ]}
    />
  );
}
