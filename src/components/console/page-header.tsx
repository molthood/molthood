import * as React from "react";

import { Heading } from "@/components/layout/heading";
import { cn } from "@/lib/utils";

export type PageHeaderProps = {
  title: string;
  description?: string;
  /** Right-aligned slot for buttons or filters. */
  actions?: React.ReactNode;
  className?: string;
};

/** Consistent title block for every console route. */
function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <Heading as="h1" size="md" weight="semibold">
          {title}
        </Heading>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export { PageHeader };
