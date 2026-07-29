import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type FeatureCardProps = React.ComponentProps<"div"> & {
  icon?: LucideIcon;
  title: string;
  description: string;
  /** Optional trailing slot — a badge, link, or capability list. */
  footer?: React.ReactNode;
};

/** Icon + title + description card, reused across marketing and docs surfaces. */
function FeatureCard({
  icon: Icon,
  title,
  description,
  footer,
  className,
  ...props
}: FeatureCardProps) {
  return (
    <Card interactive className={cn("h-full", className)} {...props}>
      <CardHeader className="gap-4">
        {Icon ? (
          <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface-raised text-primary">
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
        ) : null}
        <div className="flex flex-col gap-2">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {footer}
      </CardHeader>
    </Card>
  );
}

export { FeatureCard };
