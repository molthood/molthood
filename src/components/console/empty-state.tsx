import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
};

/**
 * Shown wherever a surface has no data yet. Phase 1 has no backend, so every
 * console route resolves to one of these rather than to fabricated rows.
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface/40 px-6 py-16 text-center",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-surface text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="mt-5 font-display text-[15px] font-bold text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed font-medium text-muted">
        {description}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
