import type { Metadata } from "next";

import {
  DisabledAction,
  Explainer,
  PageHead,
  Panel,
} from "@/components/dashboard/status-badge";

export const metadata: Metadata = { title: "Skills" };

export default function Page() {
  return (
    <div className="flex flex-col gap-8">
      <PageHead title="Skills" status="planned">
        Reusable execution workflows: package a sequence you run often, or install one somebody else built.
      </PageHead>

      <Explainer what="A named, versioned workflow describing which steps run and in what order." why="Most analysis is repetition with the subject swapped. A skill makes that repetition shareable instead of rebuilt." enables={["Install", "Publish", "Version", "Share", "Categories", "Marketplace"]} />

      <Panel title="Not available yet" description="No registry exists. Nothing can be installed or published.">
        <div className="flex flex-wrap gap-2"><DisabledAction label="Install skill" /><DisabledAction label="Publish" /></div>
      </Panel>
    </div>
  );
}
