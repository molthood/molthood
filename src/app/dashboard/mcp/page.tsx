import type { Metadata } from "next";
import { Blocks } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { phaseOf } from "@/config/roadmap";

export const metadata: Metadata = {
  title: "MCP server",
  description:
    "Molthood's analyses as tools any Model Context Protocol client can call.",
};

export default function Page() {
  return (
    <ComingSoon
      icon={Blocks}
      title="MCP server"
      description="Molthood's analyses as tools any Model Context Protocol client can call."
      phase={phaseOf("mcp")}
      detail={[
        "Your assistant performs the analysis and reads the evidence, instead of describing what it would check if it could.",
        "The same tools Molthood Agent uses internally, exposed over a standard protocol so they work in whichever client you already use.",
      ]}
      capabilities={["Tool discovery", "Analysis", "Evidence", "Streaming"]}
    />
  );
}
