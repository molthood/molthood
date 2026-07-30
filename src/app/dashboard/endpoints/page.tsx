import type { Metadata } from "next";

import {
  IllustrativeCode,
  MethodTag,
  PageHead,
  StatusBadge,
} from "@/components/dashboard/status-badge";
import { endpointGroups } from "@/config/dashboard";

export const metadata: Metadata = { title: "Endpoints" };

export default function EndpointsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHead title="Endpoints" status="in-development">
        The full catalogue, grouped by what each part of the platform does. Every
        route here is designed and none is live — the shape is published early so
        it can be argued with before it is fixed.
      </PageHead>

      <div className="flex flex-col gap-8">
        {endpointGroups.map((group) => (
          <section key={group.id}>
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="font-display text-[15px] font-bold text-foreground">
                {group.title}
              </h2>
              <span className="font-mono text-[11px] font-bold text-muted">
                {group.endpoints.length} route{group.endpoints.length === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium text-muted">{group.description}</p>

            <ul className="mt-4 flex flex-col gap-3">
              {group.endpoints.map((endpoint) => (
                <li
                  key={`${endpoint.method}-${endpoint.path}`}
                  className="rounded-card border border-border p-4"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <MethodTag method={endpoint.method} />
                    <code className="font-mono text-[13px] font-bold break-all text-foreground">
                      {endpoint.path}
                    </code>
                    <StatusBadge status="planned" className="ml-auto" />
                  </div>
                  <p className="mt-2 text-sm font-medium text-muted">
                    {endpoint.description}
                  </p>
                  <p className="mt-1 font-mono text-[11px] font-bold text-muted">
                    Authentication: {endpoint.auth}
                  </p>
                  {endpoint.response ? (
                    <div className="mt-3">
                      <IllustrativeCode label="example response" code={endpoint.response} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
