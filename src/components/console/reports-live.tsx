"use client";

import * as React from "react";
import { RefreshCw, ScrollText } from "lucide-react";

import { EmptyState } from "@/components/console/empty-state";
import { ErrorState } from "@/components/console/error-state";
import { HoverLift } from "@/components/motion/hover-lift";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import { formatRelativeTime, shortenAddress } from "@/lib/format";

/**
 * A report is the compiled output of a finished execution. Since executions
 * live in memory only, so do reports — and only runs that produced a summary
 * qualify, so this list is genuinely empty until the summarizer is configured.
 */
function ReportsLive() {
  const list = useApi((signal) => api.executions(signal));

  if (list.initialLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <SkeletonCard key={index} className="h-44" />
        ))}
      </div>
    );
  }

  if (list.error) {
    return <ErrorState error={list.error} onRetry={list.refetch} />;
  }

  const withSummary = (list.data?.items ?? []).filter(
    (record) => record.summary_status === "generated" && record.summary,
  );
  const awaitingSummary = (list.data?.items ?? []).filter(
    (record) => record.status === "succeeded" && record.summary_status !== "generated",
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Badge variant={withSummary.length ? "success" : "warning"} dot>
          {withSummary.length} reports compiled
        </Badge>
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

      {withSummary.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {withSummary.map((record) => (
            <HoverLift key={record.id} className="h-full">
              <Card interactive className="h-full p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface-raised text-primary">
                    <ScrollText className="size-[18px]" aria-hidden="true" />
                  </span>
                  <Badge variant="primary">{record.target ?? "analysis"}</Badge>
                </div>
                <h3 className="mt-4 font-display text-[15px] leading-snug font-bold text-foreground">
                  {record.target
                    ? `${record.target} analysis — ${shortenAddress(record.address, 4)}`
                    : "Execution report"}
                </h3>
                <p className="mt-2 line-clamp-4 text-sm leading-relaxed font-medium text-muted">
                  {record.summary}
                </p>
                <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
                  <span className="truncate text-xs font-semibold text-muted">
                    {formatRelativeTime(record.created_at, new Date())} ·{" "}
                    {record.evidence_count} facts
                  </span>
                  <span className="shrink-0 font-mono text-[10px] font-bold text-muted">
                    {record.id.slice(0, 8)}
                  </span>
                </div>
              </Card>
            </HoverLift>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ScrollText}
          title="No reports compiled yet"
          description={
            awaitingSummary.length
              ? `${awaitingSummary.length} execution${awaitingSummary.length === 1 ? "" : "s"} finished with real evidence, but no AI summary was generated. Set OPENROUTER_API_KEY on the backend to compile reports from them.`
              : "A report is written when an execution completes with an AI summary. Run an analysis to produce one."
          }
        />
      )}
    </div>
  );
}

export { ReportsLive };
