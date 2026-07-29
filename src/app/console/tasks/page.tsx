import type { Metadata } from "next";

import { PageHeader } from "@/components/console/page-header";
import { TasksLive } from "@/components/console/tasks-live";

export const metadata: Metadata = {
  title: "Tasks",
  description: "Submit one task and get a structured report.",
};

export default function TasksPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Tasks"
        description="Submit one request. Molthood classifies it, routes it through the providers that exist on this deployment, runs the steps in parallel where nothing depends on anything, and returns a report — including the steps that did not run and why."
      />
      <TasksLive />
    </div>
  );
}
