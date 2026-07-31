import type { Metadata } from "next";
import { Code2 } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { phaseOf } from "@/config/roadmap";

export const metadata: Metadata = {
  title: "SDK",
  description: "Typed clients for TypeScript, Python and Go.",
};

export default function Page() {
  return (
    <ComingSoon
      icon={Code2}
      title="SDK"
      description="Typed clients for TypeScript, Python and Go."
      phase={phaseOf("sdk")}
      detail={[
        "Types generated from the response contract, so a field that moves breaks at compile time rather than in production at the worst possible moment.",
        "Each client will wrap streaming, retries and error translation, which are the three things everyone reimplements badly against a raw HTTP API.",
      ]}
      capabilities={["TypeScript", "Python", "Go", "Streaming", "Typed errors"]}
    />
  );
}
