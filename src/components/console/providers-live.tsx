"use client";

import * as React from "react";
import { CircleCheck, CircleSlash, Clock, KeyRound, RefreshCw } from "lucide-react";

import { ErrorState } from "@/components/console/error-state";
import { SectionHeader } from "@/components/console/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import type { ProviderState, ProviderStatus, WorkflowPlan } from "@/lib/api/types";
import { describeProvider, describeProviders } from "@/lib/service-labels";
import { cn } from "@/lib/utils";

const STATE_TONE: Record<ProviderState, "success" | "warning" | "danger" | "default"> = {
  healthy: "success",
  enabled: "success",
  missing_key: "default",
  disabled: "default",
  rate_limited: "warning",
  unavailable: "danger",
};

/** What each state means, in the words the operator needs. */
const STATE_LABEL: Record<ProviderState, string> = {
  healthy: "healthy",
  enabled: "ready",
  missing_key: "waiting for API key",
  disabled: "disabled",
  rate_limited: "rate limited",
  unavailable: "unavailable",
};

function ProvidersLive() {
  const providers = useApi((signal) => api.providers(false, signal));
  const workflows = useApi((signal) => api.workflows(signal));
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Forces a real probe of every provider rather than reading the cached
      // result — the reason to press this is to find out whether something
      // has come back.
      await api.providers(true);
    } finally {
      setRefreshing(false);
      providers.refetch();
      workflows.refetch();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5 sm:p-6">
        <SectionHeader
          title="Providers"
          description={
            providers.data
              ? `${providers.data.usable} of ${providers.data.total} usable. Cache is running on ${providers.data.cache_backend}.`
              : undefined
          }
          actions={
            <Button
              size="sm"
              variant="secondary"
              onClick={onRefresh}
              disabled={refreshing}
            >
              <RefreshCw aria-hidden="true" />
              {refreshing ? "Probing…" : "Probe now"}
            </Button>
          }
        />

        {providers.initialLoading ? (
          <div className="mt-6 flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full" />
            ))}
          </div>
        ) : providers.error ? (
          <ErrorState
            error={providers.error}
            onRetry={providers.refetch}
            className="mt-6"
          />
        ) : (
          <ul className="mt-6 flex flex-col gap-3">
            {providers.data?.providers.map((provider) => (
              <ProviderRow key={provider.name} provider={provider} />
            ))}
          </ul>
        )}
      </Card>

      {/* --- What the deployment can actually do --- */}
      {providers.data ? (
        <Card className="p-5 sm:p-6">
          <SectionHeader
            title="Capabilities"
            description="What this deployment can do right now, and what would unlock the rest."
          />
          <ul className="mt-5 flex flex-col divide-y divide-border">
            {Object.entries(providers.data.capabilities).map(([name, capability]) => (
              <li
                key={name}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="flex items-center gap-2">
                  {capability.available ? (
                    <CircleCheck
                      className="size-3.5 shrink-0 text-[#12490F]"
                      aria-hidden="true"
                    />
                  ) : (
                    <CircleSlash
                      className="size-3.5 shrink-0 text-muted"
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={cn(
                      "font-mono text-xs font-bold",
                      capability.available ? "text-foreground" : "text-muted",
                    )}
                  >
                    {name.replace(/_/g, " ")}
                  </span>
                </span>

                <span className="text-xs font-medium text-muted">
                  {capability.available ? (
                    describeProviders(capability.providers)
                  ) : capability.enable_with.length ? (
                    <>set {capability.enable_with.join(", ")}</>
                  ) : (
                    "nothing on this deployment offers this"
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* --- Workflows, resolved against what exists --- */}
      {workflows.data?.items.length ? (
        <Card className="p-5 sm:p-6">
          <SectionHeader
            title="Workflows"
            description="Each task kind resolved against the providers that exist right now."
          />
          <ul className="mt-5 flex flex-col gap-4">
            {workflows.data.items.map((workflow) => (
              <WorkflowRow key={workflow.kind} workflow={workflow} />
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function ProviderRow({ provider }: { provider: ProviderStatus }) {
  return (
    <li className="rounded-lg border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-foreground">
              {describeProvider(provider.name)}
            </span>
            {provider.version ? (
              <span className="font-mono text-[10px] font-bold text-muted">
                {provider.version}
              </span>
            ) : null}
          </span>
          <span className="mt-1 text-xs font-medium text-muted">
            {provider.description}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {/* Latency only exists when a probe actually ran. Showing 0 ms for a
              provider that was never contacted would imply it answered. */}
          {provider.latency_ms !== null ? (
            <span className="flex items-center gap-1 font-mono text-[10px] font-bold text-muted tabular-nums">
              <Clock className="size-3" aria-hidden="true" />
              {Math.round(provider.latency_ms)} ms
            </span>
          ) : null}
          <Badge variant={STATE_TONE[provider.state]} dot>
            {STATE_LABEL[provider.state]}
          </Badge>
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {provider.capabilities.map((capability) => (
          <span
            key={capability}
            className={cn(
              "rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold",
              provider.usable
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-transparent text-muted",
            )}
          >
            {capability.replace(/_/g, " ")}
          </span>
        ))}
      </div>

      {/* The actionable line: exactly which variable to set. */}
      {provider.state === "missing_key" ? (
        <p className="mt-3 flex items-start gap-2 text-xs font-medium text-muted">
          <KeyRound className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          <span>
            Set{" "}
            <code className="font-mono font-bold text-foreground">
              {(provider.missing_env.length
                ? provider.missing_env
                : provider.required_env
              ).join(", ")}
            </code>{" "}
            and restart to enable this.
          </span>
        </p>
      ) : provider.state !== "healthy" && provider.state !== "enabled" ? (
        <p className="mt-3 text-xs font-medium text-danger">{provider.detail}</p>
      ) : null}
    </li>
  );
}

function WorkflowRow({ workflow }: { workflow: WorkflowPlan }) {
  return (
    <li>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold text-foreground">{workflow.title}</span>
        <Badge variant={workflow.runnable ? "success" : "default"} dot>
          {workflow.runnable ? "runnable" : "blocked"}
        </Badge>
      </div>

      <ol className="mt-2 flex flex-col gap-1">
        {workflow.steps.map((step) => (
          <li
            key={step.capability}
            className="flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  step.provider ? "bg-[#12490F]" : "bg-border-strong",
                )}
                aria-hidden="true"
              />
              <span
                className={cn(
                  "font-mono font-bold",
                  step.provider ? "text-foreground" : "text-muted",
                )}
              >
                {step.capability.replace(/_/g, " ")}
              </span>
              {step.required ? (
                <span className="font-mono text-[10px] font-bold text-muted">
                  required
                </span>
              ) : null}
            </span>
            <span className="font-medium text-muted">
              {step.provider ? describeProvider(step.provider) : "skipped"}
            </span>
          </li>
        ))}
      </ol>

      {workflow.blocked_by.length ? (
        <p className="mt-1.5 text-xs font-medium text-muted">
          Unblock with{" "}
          <code className="font-mono font-bold text-foreground">
            {workflow.blocked_by.join(", ")}
          </code>
        </p>
      ) : null}
    </li>
  );
}

export { ProvidersLive };
