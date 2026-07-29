"use client";

import * as React from "react";
import {
  CheckCircle2,
  History as HistoryIcon,
  RefreshCw,
  XCircle,
} from "lucide-react";

import { EmptyState } from "@/components/console/empty-state";
import { ErrorState } from "@/components/console/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import { describeServices } from "@/lib/service-labels";
import { formatRelativeTime, shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Timeline of executions this backend process has actually performed. */
function HistoryLive() {
  const list = useApi((signal) => api.executions(signal));

  if (list.initialLoading) {
    return (
      <Card className="p-6">
        <div className="flex flex-col gap-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (list.error) {
    return <ErrorState error={list.error} onRetry={list.refetch} />;
  }

  const items = list.data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Badge variant="outline">{items.length} events</Badge>
        <Button
          size="sm"
          variant="secondary"
          onClick={list.refetch}
          disabled={list.loading}
        >
          <RefreshCw aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {items.length ? (
        <Card className="p-5 sm:p-6">
          <ol className="flex flex-col">
            {items.map((record, index) => {
              const succeeded = record.status === "succeeded";
              const Icon = succeeded ? CheckCircle2 : XCircle;

              return (
                <li key={record.id} className="relative flex gap-4 pb-6 last:pb-0">
                  {index < items.length - 1 ? (
                    <span
                      className="absolute top-9 bottom-0 left-[17px] w-px bg-border"
                      aria-hidden="true"
                    />
                  ) : null}

                  <span
                    className={cn(
                      "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface",
                      succeeded ? "text-[#12490F]" : "text-danger",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>

                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <p className="font-display text-sm font-bold text-foreground">
                        {record.target
                          ? `${record.target} analysis ${succeeded ? "completed" : "failed"}`
                          : succeeded
                            ? "Execution completed"
                            : "Execution failed"}
                      </p>
                      <span className="shrink-0 font-mono text-[10px] font-bold text-muted">
                        {formatRelativeTime(record.created_at, new Date())}
                      </span>
                    </div>

                    <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed font-medium text-muted">
                      {record.error ??
                        `${record.evidence_count} facts collected from ${
                          describeServices(record.services_called)
                        }.`}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {record.address ? (
                        <span className="font-mono text-[10px] font-bold text-muted">
                          {shortenAddress(record.address, 5)}
                        </span>
                      ) : null}
                      <span className="text-xs font-semibold text-muted">
                        {record.agents_used.join(", ") || "no agents"}
                      </span>
                      <span className="font-mono text-[10px] font-bold text-muted">
                        {record.duration_ms ?? "—"} ms
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      ) : (
        <EmptyState
          icon={HistoryIcon}
          title="Nothing recorded yet"
          description="Run an analysis and it appears here. History is stored against your API key and survives a restart."
        />
      )}
    </div>
  );
}

export { HistoryLive };
