import * as React from "react";

import { cn } from "@/lib/utils";

export type SectionHeaderProps = {
  title: string;
  description?: string;
  /** Right-aligned slot for a link, filter, or button. */
  actions?: React.ReactNode;
  className?: string;
};

/**
 * Heading for a block *within* a console page. `PageHeader` owns the page
 * title; this sits below it and never repeats that role.
 */
function SectionHeader({ title, description, actions, className }: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="font-display text-[15px] font-bold text-foreground">{title}</h2>
        {description ? (
          <p className="text-sm leading-relaxed font-medium text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export { SectionHeader };
