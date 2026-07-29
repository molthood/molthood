import * as React from "react";

import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-sm font-semibold text-foreground", className)}
      {...props}
    />
  );
}

export type FieldProps = React.ComponentProps<"div"> & {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
};

/** Label + control + hint/error, wired for accessible descriptions. */
function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
  ...props
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)} {...props}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export { Field, Label };
