import * as React from "react";
import {
  CheckCircle2,
  FilePlus2,
  FolderPlus,
  PauseCircle,
  PlayCircle,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { HistoryEvent, HistoryEventKind } from "@/types/console";

const kindIcon: Record<HistoryEventKind, LucideIcon> = {
  "execution.completed": CheckCircle2,
  "execution.failed": XCircle,
  "execution.started": PlayCircle,
  "report.generated": FilePlus2,
  "agent.paused": PauseCircle,
  "project.created": FolderPlus,
};

const kindTone: Record<HistoryEventKind, string> = {
  "execution.completed": "text-[#12490F]",
  "execution.failed": "text-danger",
  "execution.started": "text-[#0B2A5C]",
  "report.generated": "text-primary",
  "agent.paused": "text-[#4A3005]",
  "project.created": "text-primary",
};

export type TimelineItemProps = {
  event: HistoryEvent;
  /** Hides the connecting rail below the final item. */
  isLast?: boolean;
  className?: string;
};

function TimelineItem({ event, isLast = false, className }: TimelineItemProps) {
  const Icon = kindIcon[event.kind];

  return (
    <li className={cn("relative flex gap-4 pb-6 last:pb-0", className)}>
      {/* Rail runs from this node down to the next one. */}
      {isLast ? null : (
        <span
          className="absolute top-9 bottom-0 left-[17px] w-px bg-border"
          aria-hidden="true"
        />
      )}

      <span
        className={cn(
          "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface",
          kindTone[event.kind],
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1 pt-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <p className="font-display text-sm font-bold text-foreground">{event.title}</p>
          <time
            dateTime={event.occurredAt}
            title={formatDateTime(event.occurredAt)}
            className="shrink-0 font-mono text-[10px] font-bold tracking-wide text-muted"
          >
            {formatRelativeTime(event.occurredAt)}
          </time>
        </div>

        <p className="mt-1.5 text-sm leading-relaxed font-medium text-muted">
          {event.description}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs font-semibold text-muted">{event.actor}</span>
          <span className="font-mono text-[10px] font-bold text-muted/80">
            {event.reference}
          </span>
        </div>
      </div>
    </li>
  );
}

export type TimelineProps = React.ComponentProps<"ol">;

/** Ordered list wrapper — `TimelineItem` renders the `<li>` itself. */
function Timeline({ className, ...props }: TimelineProps) {
  return <ol className={cn("flex flex-col", className)} {...props} />;
}

export { Timeline, TimelineItem };
