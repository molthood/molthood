import type { Metadata } from "next";

import {
  Explainer,
  IllustrativeCode,
  MethodTag,
  PageHead,
  Panel,
} from "@/components/dashboard/status-badge";
import { endpointGroups } from "@/config/dashboard";

export const metadata: Metadata = { title: "REST API" };

export default function RestApiPage() {
  const every = endpointGroups.flatMap((group) => group.endpoints);

  return (
    <div className="flex flex-col gap-8">
      <PageHead title="REST API" status="in-development">
        The engine behind the console, over plain HTTP and JSON. Every route is a
        documented GET or POST that curl can drive — there is nothing to install
        to start.
      </PageHead>

      <Explainer
        what="One request starts an analysis; the response carries the findings, each with the source it came from and whether it was confirmed, refuted, or could not be established."
        why="The console is one client. Anything else you build — a bot, a CI step, an internal tool — needs the same engine without a browser in the middle."
        enables={["Executions", "Research", "Reports", "Artifacts", "Projects", "Providers"]}
      />

      <Panel
        title="The interface, as designed"
        description={`${every.length} routes across ${endpointGroups.length} groups. None of them accepts requests yet — this describes the shape so it can be evaluated before it ships, not a surface you can call today.`}
      >
        <ul className="flex flex-col gap-2">
          {every.map((endpoint) => (
            <li
              key={`${endpoint.method}-${endpoint.path}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-surface-raised px-4 py-2.5"
            >
              <MethodTag method={endpoint.method} />
              <code className="font-mono text-[13px] font-bold text-foreground">
                {endpoint.path}
              </code>
              <span className="ml-auto shrink-0 font-mono text-[10px] font-bold text-muted">
                {endpoint.auth}
              </span>
              <span className="w-full text-xs font-medium text-muted">
                {endpoint.description}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="What a call will look like"
        description="Shown so the shape can be judged now. It will not run."
      >
        <div className="flex flex-col gap-3">
          <IllustrativeCode
            label="curl"
            code={`curl -X POST https://api.molthood.org/v1/executions \
  -H "Authorization: Bearer mk_live_..." \
  -H "content-type: application/json" \
  -d '{ "target": "token", "subject": "0x..." }'`}
          />
          <IllustrativeCode
            label="response"
            code={`{
  "id": "exe_...",
  "status": "succeeded",
  "evidence": [
    {
      "label": "Owner can pause transfers",
      "state": "confirmed",
      "source_url": "https://..."
    },
    {
      "label": "Can be sold",
      "state": "unknown",
      "reason": "The screening source did not answer."
    }
  ]
}`}
          />
        </div>
      </Panel>
    </div>
  );
}
