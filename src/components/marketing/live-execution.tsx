"use client";

import * as React from "react";
import { Activity, ChevronDown, FileText, Layers } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { API_BASE_URL } from "@/lib/api/client";
import type { PublicExecution, PublicStep } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * Executions their owners chose to publish, streamed live.
 *
 * Nothing here is fabricated. There is no seeded activity, no demo run, and no
 * placeholder timeline — if nobody has published anything, the section says so
 * and stops. A landing page that invents execution logs to look busy is
 * exactly the kind of claim this product exists to catch other people making.
 *
 * The feed is also deliberately narrow: it carries the *kind* of work and its
 * progress, never the subject and never the providers. That redaction happens
 * server-side; this component could not leak them if it tried.
 */
function LiveExecution() {
  const [items, setItems] = React.useState<PublicExecution[] | null>(null);
  const [connected, setConnected] = React.useState(false);

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function listen() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/feed/stream?limit=6`, {
          headers: { accept: "text/event-stream" },
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok || !response.body) {
          // The feed being unreachable is not an error worth shouting about
          // on a marketing page — it renders as "nothing published yet".
          if (!cancelled) setItems([]);
          return;
        }

        setConnected(true);
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += value;

          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");

            const line = frame
              .split("\n")
              .find((part) => part.startsWith("data:"));
            if (!line) continue;

            try {
              setItems(JSON.parse(line.slice(5).trim()) as PublicExecution[]);
            } catch {
              // One malformed frame must not stop a stream that is otherwise
              // fine; the next one replaces the whole list anyway.
            }
          }
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setConnected(false);
      }
    }

    void listen();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <Activity className="size-4 text-primary" aria-hidden="true" />
          <span className="font-mono text-[11px] font-bold tracking-wide text-muted uppercase">
            Live executions
          </span>
        </span>
        {connected ? (
          <span className="flex items-center gap-1.5">
            <span
              className="size-1.5 animate-pulse rounded-full bg-[#12490F]"
              aria-hidden="true"
            />
            <span className="font-mono text-[10px] font-bold text-muted">
              streaming
            </span>
          </span>
        ) : null}
      </div>

      {items === null ? (
        <FeedSkeleton />
      ) : items.length === 0 ? (
        <EmptyFeed />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((execution) => (
            <ExecutionRow key={execution.id} execution={execution} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Shown while the first frame is still in flight. */
function FeedSkeleton() {
  return (
    <ul className="flex flex-col gap-3" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <li
          key={index}
          className="h-[4.5rem] animate-pulse rounded-xl border border-border bg-surface-raised/60"
          style={{ animationDelay: `${index * 120}ms` }}
        />
      ))}
    </ul>
  );
}

/**
 * The honest state of a new deployment.
 *
 * Explains what would appear here and why it is empty, rather than leaving a
 * blank panel that reads as broken.
 */
function EmptyFeed() {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-surface-raised/40 px-6 py-12 text-center">
      <span className="mx-auto flex size-10 items-center justify-center rounded-lg border border-border bg-surface">
        <Layers className="size-4 text-muted" aria-hidden="true" />
      </span>
      <p className="mt-4 font-display text-[15px] font-bold text-foreground">
        No public executions yet
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed font-medium text-muted">
        Every execution is private to whoever ran it. This feed shows only the
        ones their owners chose to publish — so it stays empty until somebody
        does.
      </p>
    </div>
  );
}

const STATUS_TONE: Record<PublicExecution["status"], "success" | "info" | "danger"> = {
  completed: "success",
  running: "info",
  failed: "danger",
};

function ExecutionRow({ execution }: { execution: PublicExecution }) {
  const [open, setOpen] = React.useState(false);

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-surface-raised transition-colors hover:border-border-strong">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-foreground">
              {execution.kind}
            </span>
            <Badge variant={STATUS_TONE[execution.status]} dot>
              {execution.status}
            </Badge>
          </span>
          <span className="text-xs font-medium text-muted">
            {execution.current_step}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-4">
          <span className="text-right">
            <span className="block font-mono text-[11px] font-bold text-foreground tabular-nums">
              {formatElapsed(execution.elapsed_ms)}
            </span>
            <span className="block font-mono text-[10px] font-medium text-muted tabular-nums">
              {execution.findings} findings · {execution.sources} sources
            </span>
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted transition-transform duration-200",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </span>
      </button>

      {/* Progress reads at a glance even collapsed. */}
      <div className="h-0.5 w-full bg-border" aria-hidden="true">
        <div
          className="h-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${Math.round(execution.progress * 100)}%` }}
        />
      </div>

      {open ? (
        <div className="border-t border-border px-4 py-4">
          <ol className="flex flex-col gap-2.5">
            {execution.steps.map((step, index) => (
              <StepRow key={index} step={step} />
            ))}
          </ol>

          {execution.has_report ? (
            <p className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-xs font-medium text-muted">
              <FileText className="size-3.5 shrink-0" aria-hidden="true" />
              A report was produced for this execution.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function StepRow({ step }: { step: PublicStep }) {
  const done = step.state === "completed";
  const failed = step.state === "failed";
  const running = step.state === "running";

  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            done && "bg-[#12490F]",
            running && "animate-pulse bg-primary",
            failed && "bg-danger",
            step.state === "waiting" && "bg-border-strong",
          )}
          aria-hidden="true"
        />
        <span
          className={cn(
            "truncate text-xs font-medium",
            step.state === "waiting" ? "text-muted" : "text-foreground",
          )}
        >
          {step.label}
        </span>
      </span>
      <span className="shrink-0 font-mono text-[10px] font-bold text-muted tabular-nums">
        {step.duration_ms !== null ? `${step.duration_ms} ms` : ""}
      </span>
    </li>
  );
}

function formatElapsed(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export { LiveExecution };
