import * as React from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type SettingsCardProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Bottom bar — typically a save button plus a hint. */
  footer?: React.ReactNode;
  className?: string;
};

/** Titled panel used by every settings section. */
function SettingsCard({
  title,
  description,
  children,
  footer,
  className,
}: SettingsCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="border-b border-border p-5">
        <h3 className="font-display text-[15px] font-bold text-foreground">{title}</h3>
        {description ? (
          <p className="mt-1.5 text-sm leading-relaxed font-medium text-muted">
            {description}
          </p>
        ) : null}
      </div>

      <div className="p-5">{children}</div>

      {footer ? (
        <div className="flex flex-col gap-3 border-t border-border bg-surface-raised/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}

export type SettingsRowProps = {
  label: string;
  description?: string;
  control: React.ReactNode;
  htmlFor?: string;
};

/** Label + description on the left, a control on the right. */
function SettingsRow({ label, description, control, htmlFor }: SettingsRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="min-w-0">
        <label
          htmlFor={htmlFor}
          className="text-sm font-semibold text-foreground"
        >
          {label}
        </label>
        {description ? (
          <p className="mt-1 text-sm leading-relaxed font-medium text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}

export { SettingsCard, SettingsRow };
