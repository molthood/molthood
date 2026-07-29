"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bot,
  Boxes,
  Coins,
  FileCode2,
  Hammer,
  LineChart,
  RefreshCw,
  Rocket,
  ShieldAlert,
  Users,
  type LucideIcon,
} from "lucide-react";

import { ErrorState } from "@/components/console/error-state";
import { HoverLift } from "@/components/motion/hover-lift";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import type { AgentSummary } from "@/lib/api/types";
import { formatDuration, formatRelativeTime } from "@/lib/format";
import { describeProvider, describeServices } from "@/lib/service-labels";
import { cn } from "@/lib/utils";

const AGENT_ICON: Record<string, LucideIcon> = {
  launch: Rocket,
  project: Boxes,
  contract: FileCode2,
  market: LineChart,
  risk: ShieldAlert,
  builder: Hammer,
  portfolio: Coins,
  community: Users,
};

const STATUS: Record<
  AgentSummary["status"],
  { variant: "success" | "warning" | "default"; label: string }
> = {
  active: { variant: "success", label: "Active" },
  degraded: { variant: "warning", label: "Degraded" },
  not_implemented: { variant: "default", label: "Not implemented" },
};

function AgentTile({
  agent,
  onOpen,
}: {
  agent: AgentSummary;
  onOpen: (agent: AgentSummary) => void;
}) {
  const Icon = AGENT_ICON[agent.kind] ?? Bot;
  const status = STATUS[agent.status];

  return (
    <HoverLift className="h-full">
      {/* A button rather than a card with a click handler: the tile opens a
          panel, so it has to be reachable by keyboard and announce itself as
          activatable. */}
      <button
        type="button"
        onClick={() => onOpen(agent)}
        aria-label={`Open details for ${agent.name}`}
        className="h-full w-full rounded-card text-left outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Card interactive className="flex h-full flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-raised text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <Badge variant={status.variant} dot>
              {status.label}
            </Badge>
          </div>

          <div className="mt-4 flex items-baseline gap-2">
            <h3 className="font-display text-[15px] font-bold text-foreground">
              {agent.name}
            </h3>
            <span className="font-mono text-[10px] font-bold text-muted">
              v{agent.version}
            </span>
          </div>

          <p className="mt-2 line-clamp-3 text-sm leading-relaxed font-medium text-muted">
            {agent.description}
          </p>

          <ul className="mt-4 flex flex-wrap gap-1.5">
            {agent.capabilities.map((capability) => (
              <li key={capability}>
                <Badge variant="outline">{capability.replace(/_/g, " ")}</Badge>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-xs font-medium text-muted">
              {agent.required_services.length
                ? `Needs ${describeServices(agent.required_services)}`
                : "No external dependencies"}
            </span>
            <span className="shrink-0 text-xs font-bold text-foreground tabular-nums">
              {agent.runs} {agent.runs === 1 ? "run" : "runs"}
            </span>
          </div>
        </Card>
      </button>
    </HoverLift>
  );
}

/**
 * One agent, in full.
 *
 * Everything here arrives with the list, so opening the panel costs no request
 * and shows no spinner — the click is the whole interaction.
 */
function AgentDetail({
  agent,
  onClose,
}: {
  agent: AgentSummary | null;
  onClose: () => void;
}) {
  // Held after close so the exit animation still has something to render.
  const [shown, setShown] = React.useState(agent);
  React.useEffect(() => {
    if (agent) setShown(agent);
  }, [agent]);

  if (!shown) return null;

  const Icon = AGENT_ICON[shown.kind] ?? Bot;
  const status = STATUS[shown.status];
  const rate = shown.runs ? Math.round((shown.succeeded / shown.runs) * 100) : null;

  return (
    <Drawer open={agent !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <span className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-raised text-primary">
              <Icon className="size-4.5" aria-hidden="true" />
            </span>
            <DrawerTitle>{shown.name}</DrawerTitle>
            <Badge variant={status.variant} dot>
              {status.label}
            </Badge>
          </span>
          <DrawerDescription>{shown.description}</DrawerDescription>
        </DrawerHeader>

        <DrawerBody className="flex flex-col gap-6">
          <dl className="grid grid-cols-2 gap-3">
            <Stat label="Runs" value={String(shown.runs)} />
            {/* A success rate needs runs to be a rate of. With none, the field
                says so rather than showing 0% or a flattering 100%. */}
            <Stat
              label="Succeeded"
              value={rate === null ? "No runs yet" : `${rate}% of ${shown.runs}`}
              muted={rate === null}
            />
            <Stat
              label="Typical duration"
              value={
                shown.median_duration_ms === null
                  ? "Not measured"
                  : formatDuration(shown.median_duration_ms)
              }
              muted={shown.median_duration_ms === null}
            />
            <Stat
              label="Last run"
              value={
                shown.last_run_at
                  ? formatRelativeTime(shown.last_run_at, new Date())
                  : "Never"
              }
              muted={!shown.last_run_at}
            />
          </dl>

          <Block title="Capabilities">
            <ul className="flex flex-wrap gap-1.5">
              {shown.capabilities.map((capability) => (
                <li key={capability}>
                  <Badge variant="outline">{capability.replace(/_/g, " ")}</Badge>
                </li>
              ))}
            </ul>
          </Block>

          <Block
            title="Dependencies"
            hint={
              shown.status === "degraded"
                ? "This agent is degraded because a dependency below is not live."
                : undefined
            }
          >
            {shown.services.length ? (
              <ul className="flex flex-col gap-2">
                {shown.services.map((service) => (
                  <li
                    key={service.name}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2"
                  >
                    <span className="text-sm font-bold text-foreground">
                      {describeProvider(service.name)}
                    </span>
                    <Badge
                      variant={service.state === "live" ? "success" : "warning"}
                      dot
                    >
                      {service.state}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm font-medium text-muted">
                Runs entirely on evidence other agents already gathered — nothing
                external has to be reachable for it to work.
              </p>
            )}
          </Block>

          {shown.targets.length ? (
            <Block title="What it has been used on">
              <ul className="flex flex-col gap-2">
                {shown.targets.map((target) => (
                  <li
                    key={target.target}
                    className="flex items-center justify-between gap-3 text-sm font-medium"
                  >
                    <span className="text-foreground">{target.target}</span>
                    <span className="font-mono text-xs font-bold text-muted tabular-nums">
                      {target.runs}
                    </span>
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}

          <p className="font-mono text-[10px] leading-relaxed font-bold text-muted">
            version {shown.version} · id {shown.id}
          </p>
        </DrawerBody>

        <DrawerFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {shown.implemented ? (
            <Button asChild>
              <Link href="/executions">Run an analysis</Link>
            </Button>
          ) : null}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function Stat({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised px-3 py-2.5">
      <dt className="text-[11px] font-bold tracking-wide text-muted uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-sm font-bold tabular-nums",
          muted ? "text-muted" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Block({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-display text-sm font-bold text-foreground">{title}</h3>
      {hint ? <p className="text-xs font-medium text-muted">{hint}</p> : null}
      {children}
    </section>
  );
}

function AgentsLive() {
  const agents = useApi((signal) => api.agents(signal));
  const [selected, setSelected] = React.useState<AgentSummary | null>(null);

  if (agents.initialLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <SkeletonCard key={index} className="h-52" />
        ))}
      </div>
    );
  }

  if (agents.error) {
    return <ErrorState error={agents.error} onRetry={agents.refetch} />;
  }

  const items = agents.data?.items ?? [];
  const live = items.filter((agent) => agent.implemented);
  const planned = items.filter((agent) => !agent.implemented);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success" dot>
            {agents.data?.implemented} implemented
          </Badge>
          <Badge variant="outline">
            {(agents.data?.total ?? 0) - (agents.data?.implemented ?? 0)} planned
          </Badge>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={agents.refetch}
          disabled={agents.loading}
        >
          <RefreshCw aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-[15px] font-bold text-foreground">
          Live agents
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {live.map((agent) => (
            <AgentTile key={agent.id} agent={agent} onOpen={setSelected} />
          ))}
        </div>
      </section>

      {planned.length ? (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-[15px] font-bold text-foreground">
              Planned agents
            </h2>
            <p className="mt-1 text-sm font-medium text-muted">
              Registered in the runtime but with no implementation yet. They
              cannot be executed.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {planned.map((agent) => (
              <AgentTile key={agent.id} agent={agent} onOpen={setSelected} />
            ))}
          </div>
        </section>
      ) : null}

      <AgentDetail agent={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

export { AgentsLive };
