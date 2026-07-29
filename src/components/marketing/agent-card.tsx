import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AgentDefinition } from "@/config/agents";
import { cn } from "@/lib/utils";

const statusLabel: Record<AgentDefinition["status"], string> = {
  live: "Live",
  planned: "Planned",
};

export type AgentCardProps = React.ComponentProps<"div"> & {
  agent: AgentDefinition;
};

/** Presentational card for one agent in the roster. Carries no behaviour. */
function AgentCard({ agent, className, ...props }: AgentCardProps) {
  const Icon = agent.icon;

  return (
    <Card interactive className={cn("h-full", className)} {...props}>
      <CardHeader className="h-full gap-5">
        <div className="flex items-start justify-between gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface-raised text-primary">
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
          <Badge variant={agent.status === "live" ? "success" : "outline"}>
            {statusLabel[agent.status]}
          </Badge>
        </div>

        <div className="flex flex-col gap-2">
          <CardTitle>{agent.name}</CardTitle>
          <CardDescription>{agent.summary}</CardDescription>
        </div>

        <ul className="mt-auto flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-4">
          {agent.capabilities.map((capability) => (
            <li
              key={capability}
              className="font-mono text-[11px] font-semibold tracking-wide text-muted"
            >
              {capability}
            </li>
          ))}
        </ul>
      </CardHeader>
    </Card>
  );
}

export { AgentCard };
