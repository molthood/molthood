import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type LoadingStateProps = {
  label?: string;
  className?: string;
};

/** Centred spinner for suspense boundaries and in-flight panels. */
function LoadingState({ label = "Loading", className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-card border border-border bg-surface px-6 py-16",
        className,
      )}
    >
      <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm font-semibold text-muted">{label}</p>
    </div>
  );
}

/** Inline variant for buttons and table headers. */
function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn("size-4 animate-spin", className)}
      role="status"
      aria-label="Loading"
    />
  );
}

export { LoadingState, Spinner };
