import type { Metadata } from "next";

import { PageHeader } from "@/components/console/page-header";
import { SubjectsLive } from "@/components/console/subjects-live";

export const metadata: Metadata = {
  title: "Projects",
  description: "Every subject you have analysed, grouped and scored.",
};

export default function ProjectsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Projects"
        description="Every subject you have analysed, grouped automatically. Nothing to create and nothing to name — a subject appears the moment it is looked at, and carries its latest score plus whatever changed since the run before."
      />
      <SubjectsLive />
    </div>
  );
}
