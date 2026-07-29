import * as React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { Sparkline } from "@/components/console/sparkline";
import { Card } from "@/components/ui/card";
import { formatDelta } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Stat } from "@/types/console";

export type StatCardProps = React.ComponentProps<"div"> & {
  stat: Stat;
  /** Inverts delta colouring for metrics where lower is better (e.g. runtime). */
  lowerIsBetter?: boolean;
};

function StatCard({ stat, lowerIsBetter = false, className, ...props }: StatCardProps) {
  const Icon = stat.icon;
  const hasDelta = stat.delta !== null;
  const isPositive = hasDelta && stat.delta! > 0;
  const isGood = lowerIsBetter ? !isPositive : isPositive;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <Card className={cn("p-5", className)} {...props}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] font-bold tracking-[0.12em] text-muted uppercase">
          {stat.label}
        </p>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-raised text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="font-display text-2xl leading-none font-bold text-foreground tabular-nums">
          {stat.value}
        </p>
        <Sparkline
          series={stat.series}
          className={cn(isGood ? "text-[#12490F]" : "text-danger", "opacity-70")}
        />
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        {hasDelta ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-bold tabular-nums",
              isGood ? "text-[#12490F]" : "text-danger",
            )}
          >
            <TrendIcon className="size-3.5" aria-hidden="true" />
            {formatDelta(stat.delta!)}
          </span>
        ) : null}
        <span className="truncate text-xs font-medium text-muted">
          {stat.deltaLabel}
        </span>
      </div>
    </Card>
  );
}

export { StatCard };
