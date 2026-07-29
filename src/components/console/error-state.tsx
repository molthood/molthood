"use client";

import * as React from "react";
import { AlertTriangle, PlugZap, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export type ErrorStateProps = {
  error: ApiError;
  onRetry?: () => void;
  className?: string;
};

/**
 * Renders a backend failure as guidance, never as a stack trace or raw JSON.
 * Every backend error carries a suggested action; this surfaces it.
 */
function ErrorState({ error, onRetry, className }: ErrorStateProps) {
  const Icon = error.isOffline ? PlugZap : AlertTriangle;

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-danger/40 bg-danger/5 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-xl border border-danger/30 bg-surface text-danger">
        <Icon className="size-5" aria-hidden="true" />
      </span>

      <h3 className="mt-5 font-display text-[15px] font-bold text-foreground">
        {error.isOffline ? "Backend not reachable" : error.message}
      </h3>

      <p className="mt-2 max-w-md text-sm leading-relaxed font-medium text-muted">
        {error.suggestedAction}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <span className="font-mono text-[10px] font-bold tracking-wide text-muted">
          {error.code}
        </span>
        {error.requestId ? (
          <span className="font-mono text-[10px] font-bold tracking-wide text-muted">
            request {error.requestId.slice(0, 12)}
          </span>
        ) : null}
      </div>

      {onRetry ? (
        <Button variant="secondary" onClick={onRetry} className="mt-6">
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export type InlineErrorProps = {
  error: ApiError;
  className?: string;
};

/** Compact variant for use inside a card that already has a heading. */
function InlineError({ error, className }: InlineErrorProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3",
        className,
      )}
    >
      <AlertTriangle
        className="mt-0.5 size-4 shrink-0 text-danger"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground">
          {error.isOffline ? "Backend not reachable" : error.message}
        </p>
        <p className="mt-1 text-sm leading-relaxed font-medium text-muted">
          {error.suggestedAction}
        </p>
      </div>
    </div>
  );
}

export { ErrorState, InlineError };
