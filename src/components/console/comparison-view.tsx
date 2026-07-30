"use client";

import * as React from "react";
import { ArrowLeftRight, Check, Minus, TriangleAlert, X } from "lucide-react";

import { ErrorState } from "@/components/console/error-state";
import { SectionHeader } from "@/components/console/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import type { Comparison, ComparisonSide } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { formatEvidenceValue } from "@/lib/format";

/**
 * Two subjects side by side.
 *
 * The screen's job is the same as the engine's: never imply more than the data
 * supports. Checks that could not be compared are shown **apart from** the
 * shared ones and never styled as differences, because the difference there is
 * in the coverage rather than in the subjects.
 */
function ComparisonView({
  left,
  right,
}: {
  left: string;
  right: string;
}) {
  const comparison = useApi(
    (signal) => api.compare(left, right, signal),
    [left, right],
  );

  if (comparison.initialLoading) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (comparison.error) {
    return <ErrorState error={comparison.error} onRetry={comparison.refetch} />;
  }
  if (!comparison.data) return null;

  return <Result data={comparison.data} />;
}

function Result({ data }: { data: Comparison }) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <SideCard side={data.left} winner={data.verdict === "left"} />
          <ArrowLeftRight
            className="mx-auto size-4 shrink-0 text-muted"
            aria-hidden="true"
          />
          <SideCard side={data.right} winner={data.verdict === "right"} />
        </div>

        {/* A withheld verdict is not a tie. The engine distinguishes them and
            so does this: `null` explains why nothing was concluded. */}
        <div
          className={cn(
            "mt-5 rounded-card border px-4 py-3.5",
            data.verdict === null
              ? "border-border bg-surface-raised"
              : "border-primary/25 bg-primary/[0.06]",
          )}
        >
          <p className="text-[11px] font-bold tracking-wide text-muted uppercase">
            {data.verdict === null
              ? "No verdict"
              : data.verdict === "tie"
                ? "Tie"
                : "Verdict"}
          </p>
          <p className="mt-1 text-sm leading-relaxed font-medium text-foreground">
            {data.verdict_reason}
          </p>
        </div>

        {data.warnings.map((warning) => (
          <p
            key={warning}
            className="mt-3 flex items-start gap-2 text-xs leading-relaxed font-medium text-muted"
          >
            <TriangleAlert
              className="mt-0.5 size-3.5 shrink-0 text-warning"
              aria-hidden="true"
            />
            {warning}
          </p>
        ))}
      </Card>

      {data.shared.length ? (
        <Card className="p-5 sm:p-6">
          <SectionHeader
            title="Compared"
            description={`${data.shared_checks} check(s) ran on both sides.`}
          />
          <div className="mt-5 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-2 text-[11px] font-bold tracking-wide text-muted uppercase">
                    Check
                  </th>
                  <th className="px-2 py-2 text-[11px] font-bold tracking-wide text-muted uppercase">
                    {data.left.label}
                  </th>
                  <th className="px-2 py-2 text-[11px] font-bold tracking-wide text-muted uppercase">
                    {data.right.label}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.shared.map((check) => (
                  <tr key={check.kind} className="border-b border-border last:border-0">
                    <td className="px-2 py-2.5 align-top">
                      <span className="flex items-start gap-1.5 font-medium text-foreground">
                        {check.agrees ? (
                          <Minus
                            className="mt-1 size-3 shrink-0 text-muted"
                            aria-label="Both sides agree"
                          />
                        ) : (
                          <ArrowLeftRight
                            className="mt-1 size-3 shrink-0 text-primary"
                            aria-label="The sides differ"
                          />
                        )}
                        {check.label}
                      </span>
                    </td>
                    <Cell state={check.left.state} value={check.left.value} />
                    <Cell state={check.right.state} value={check.right.value} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {data.not_comparable.length ? (
        <Card className="p-5 sm:p-6">
          <SectionHeader
            title="Not comparable"
            description="These are not differences between the subjects — they are gaps in what was checked."
          />
          <ul className="mt-5 flex flex-col gap-2">
            {data.not_comparable.map((check) => (
              <li
                key={check.kind}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-raised px-4 py-2.5"
              >
                <span className="text-sm font-medium text-foreground">
                  {check.label}
                </span>
                <span className="font-mono text-[11px] font-bold text-muted">
                  {check.reason}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function Cell({ state, value }: { state: string; value: unknown }) {
  const Icon = state === "confirmed" ? Check : X;
  return (
    <td className="px-2 py-2.5 align-top">
      <span className="flex items-start gap-1.5 font-medium text-muted">
        <Icon
          className={cn(
            "mt-0.5 size-3 shrink-0",
            state === "confirmed" ? "text-[#12490F]" : "text-danger",
          )}
          aria-hidden="true"
        />
        {formatEvidenceValue(value)}
      </span>
    </td>
  );
}

function SideCard({ side, winner }: { side: ComparisonSide; winner: boolean }) {
  return (
    <div
      className={cn(
        "rounded-card border px-4 py-3",
        winner ? "border-primary/40 bg-primary/[0.06]" : "border-border",
      )}
    >
      <p className="font-mono text-[13px] font-bold text-foreground">{side.label}</p>
      <span className="mt-2 flex flex-wrap items-center gap-2">
        {/* Never the number alone: the scale runs the opposite way to the
            intuition, so it is always shown with its level. */}
        {side.score !== null ? (
          <Badge variant={winner ? "success" : "outline"} dot>
            {side.score}/100 · {side.level}
          </Badge>
        ) : (
          <Badge variant="outline">unscored</Badge>
        )}
        <span className="font-mono text-[10px] font-bold text-muted">
          {side.checks} checks
        </span>
      </span>
    </div>
  );
}

/** Picks two executions to compare. */
function ComparePicker() {
  const [left, setLeft] = React.useState("");
  const [right, setRight] = React.useState("");
  const [pair, setPair] = React.useState<[string, string] | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5 sm:p-6">
        <SectionHeader
          title="Compare two subjects"
          description="Two different subjects at the same moment. To see how one subject changed over time, open its latest execution instead."
        />
        <form
          className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (left.trim() && right.trim()) setPair([left.trim(), right.trim()]);
          }}
        >
          <Field label="First execution" htmlFor="left" className="flex-1">
            <input
              id="left"
              value={left}
              onChange={(event) => setLeft(event.target.value)}
              placeholder="execution id"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-border-strong"
            />
          </Field>
          <Field label="Second execution" htmlFor="right" className="flex-1">
            <input
              id="right"
              value={right}
              onChange={(event) => setRight(event.target.value)}
              placeholder="execution id"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-border-strong"
            />
          </Field>
          <Button type="submit" disabled={!left.trim() || !right.trim()}>
            Compare
          </Button>
        </form>
      </Card>

      {pair ? <ComparisonView left={pair[0]} right={pair[1]} /> : null}
    </div>
  );
}

export { ComparePicker, ComparisonView };
