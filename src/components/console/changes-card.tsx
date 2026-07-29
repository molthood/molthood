"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, History, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ChangeItem, ChangeReport } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const SEVERITY_TONE: Record<ChangeItem["severity"], "danger" | "warning" | "default"> = {
  alarming: "danger",
  notable: "warning",
  informational: "default",
};

/** A word for what happened, in the reader's language rather than the diff's. */
const DIRECTION_LABEL: Record<ChangeItem["direction"], string> = {
  broke: "stopped holding",
  recovered: "holds again",
  lost: "no longer checkable",
  restored: "checkable again",
  appeared: "new",
  cleared: "cleared",
  rose: "up",
  fell: "down",
  changed: "changed",
};

function reportOf(facts: Record<string, unknown>): ChangeReport | null {
  const value = facts.changes;
  if (!value || typeof value !== "object") return null;
  const report = value as ChangeReport;
  return Array.isArray(report.items) ? report : null;
}

/** "3 hours ago", "2 days ago" — the span this comparison covers. */
function describeElapsed(seconds: number): string {
  if (seconds < 90) return "moments ago";
  if (seconds < 5400) return `${Math.round(seconds / 60)} minutes ago`;
  if (seconds < 172_800) return `${Math.round(seconds / 3600)} hours ago`;
  return `${Math.round(seconds / 86_400)} days ago`;
}

/**
 * What moved since the last analysis of this same subject.
 *
 * The card renders even when nothing changed, because "checked, still true" is
 * a real answer and a different one from "never looked before" — which renders
 * nothing at all. Collapsing those two is the same mistake as reading an
 * unknown as a pass.
 */
function ChangesCard({
  facts,
  className,
}: {
  facts: Record<string, unknown>;
  className?: string;
}) {
  const report = reportOf(facts);
  if (!report) return null;

  const since = describeElapsed(report.elapsed_seconds);
  const alarming = report.alarming > 0;

  return (
    <Card
      className={cn(alarming && "border-danger/30 bg-danger/5", "p-5", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          {alarming ? (
            <TriangleAlert className="size-4 text-danger" aria-hidden="true" />
          ) : (
            <History className="size-4 text-primary" aria-hidden="true" />
          )}
          <span className="font-display text-[15px] font-bold text-foreground">
            Since the last check
          </span>
        </span>
        <Link
          href={`/console/executions/${report.previous_execution_id}`}
          className="font-mono text-[10px] font-bold text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          compared with {since}
        </Link>
      </div>

      {report.total ? (
        <ul className="mt-4 flex flex-col gap-2">
          {report.items.map((item, index) => (
            <li
              key={`${item.kind}-${index}`}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2.5"
            >
              <span className="flex min-w-0 items-start gap-2">
                <Direction direction={item.direction} />
                <span className="min-w-0 text-sm font-medium text-foreground">
                  {item.detail}
                </span>
              </span>
              <Badge variant={SEVERITY_TONE[item.severity]} className="shrink-0">
                {DIRECTION_LABEL[item.direction] ?? item.direction}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm font-medium text-muted">
          Nothing material changed. Everything checked last time was checked
          again and gave the same answer.
        </p>
      )}
    </Card>
  );
}

function Direction({ direction }: { direction: ChangeItem["direction"] }) {
  if (direction === "rose") {
    return (
      <ArrowUpRight
        className="mt-0.5 size-3.5 shrink-0 text-muted"
        aria-hidden="true"
      />
    );
  }
  if (direction === "fell") {
    return (
      <ArrowDownRight
        className="mt-0.5 size-3.5 shrink-0 text-muted"
        aria-hidden="true"
      />
    );
  }
  return null;
}

export { ChangesCard };
