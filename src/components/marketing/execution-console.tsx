"use client";

import * as React from "react";
import { Circle, RotateCw } from "lucide-react";

import { API_BASE_URL } from "@/lib/api/client";
import type { PublicExecution } from "@/lib/api/types";
import { cn } from "@/lib/utils";

//: Milliseconds per character while a line writes itself out. Roughly 45
//: characters a second — quick enough not to hold the reader up, slow enough
//: that the line reads as being written rather than pasted.
const TYPE_MS = 22;

/**
 * A live execution console for the landing page.
 *
 * Shaped like a build log — timestamped lines, monospaced, streaming in order —
 * because that is the format people already read execution output in. It is
 * explicitly *not* a hacker terminal: no fake cursor typing, no green-on-black,
 * no invented commands. Every line below corresponds to a phase that genuinely
 * ran on a real execution somebody published.
 *
 * When nothing is published it says so and stops. A landing page that
 * fabricates log lines to look busy would be making exactly the kind of
 * unverifiable claim this product exists to catch.
 */
function ExecutionConsole() {
  const [items, setItems] = React.useState<PublicExecution[] | null>(null);
  const [live, setLive] = React.useState(false);

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function listen() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/feed/stream?limit=4`, {
          headers: { accept: "text/event-stream" },
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok || !response.body) {
          if (!cancelled) setItems([]);
          return;
        }

        setLive(true);
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

            const data = frame.split("\n").find((line) => line.startsWith("data:"));
            if (!data) continue;
            try {
              setItems(JSON.parse(data.slice(5).trim()) as PublicExecution[]);
            } catch {
              // One bad frame must not end a stream that is otherwise fine.
            }
          }
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLive(false);
      }
    }

    void listen();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const lines = React.useMemo(() => toLines(items ?? []), [items]);
  const running = (items ?? []).some((item) => item.status === "running");

  // Playback state. A finished execution is a recording, so the log fills in
  // at the pace the run actually took rather than appearing all at once —
  // `shown` counts settled lines, `typed` is how much of the next one has
  // been written out.
  const [shown, setShown] = React.useState(0);
  const [typed, setTyped] = React.useState(0);
  const [replay, setReplay] = React.useState(0);

  React.useEffect(() => {
    if (!lines.length) return;

    // Anyone who has asked for less motion gets the whole log immediately.
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      setShown(lines.length);
      setTyped(0);
      return;
    }

    setShown(0);
    setTyped(0);

    let index = 0;
    let timer: number;

    /** Write one line out a character at a time, then pause and start the next. */
    const type = () => {
      const line = lines[index];
      if (!line) return;

      let position = 0;
      const step = () => {
        position += 1;
        setTyped(position);

        if (position < line.text.length) {
          timer = window.setTimeout(step, TYPE_MS);
          return;
        }

        // Line finished: settle it, then wait the interval this phase really
        // took before the next one begins.
        setShown(index + 1);
        setTyped(0);
        index += 1;

        if (index < lines.length) {
          timer = window.setTimeout(type, lines[index].delayMs);
        }
      };

      step();
    };

    timer = window.setTimeout(type, 300);
    return () => window.clearTimeout(timer);
  }, [lines, replay]);

  const visible = lines.slice(0, shown);
  const pending = shown < lines.length ? lines[shown] : null;
  const streaming = pending !== null;

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-sm">
      {/* Chrome: identifies this as an execution console, not a shell. */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-raised px-4 py-2.5">
        <span className="flex items-center gap-2">
          {/* Offset by a third of the cycle each, so they read as a
              sequence travelling left to right rather than three lights
              flashing in unison. */}
          <span className="flex gap-1.5" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <Circle
                key={index}
                className="size-2 fill-primary text-primary"
                style={{
                  animation: "blink 1.8s ease-in-out infinite",
                  animationDelay: `${index * 0.6}s`,
                }}
              />
            ))}
          </span>
          <span className="font-mono text-[11px] font-bold text-muted">
            execution console
          </span>
        </span>

        <span className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setReplay((value) => value + 1)}
            aria-label="Replay the execution log"
            title="Replay"
            className="-m-2 inline-flex size-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground sm:m-0 sm:size-8"
          >
            <RotateCw
              className={cn("size-3.5", streaming && "animate-spin")}
              aria-hidden="true"
            />
          </button>

          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-1.5 rounded-full",
                live ? "animate-pulse bg-[#12490F]" : "bg-border-strong",
              )}
              aria-hidden="true"
            />
            <span className="font-mono text-[10px] font-bold text-muted">
              {running ? "running" : live ? "connected" : "idle"}
            </span>
          </span>
        </span>
      </div>

      <div
        className="max-h-[22rem] overflow-y-auto px-4 py-3.5"
        role="log"
        aria-live="polite"
        aria-label="Live execution output"
      >
        {items === null ? (
          <ConsoleSkeleton />
        ) : lines.length === 0 ? (
          <EmptyConsole />
        ) : (
          <ol className="flex flex-col gap-1">
            {visible.map((line, index) => (
              <li
                key={`${line.key}-${index}`}
                className="flex items-baseline gap-3 font-mono text-[12px] leading-relaxed"
                // Staggered so the log reads as arriving rather than pasted.
                style={{ animation: `fadeIn 300ms ease-out ${index * 28}ms both` }}
              >
                <span className="shrink-0 text-muted tabular-nums">
                  {line.time}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-bold",
                    line.tone === "start" && "text-primary",
                    line.tone === "done" && "text-[#12490F]",
                    line.tone === "fail" && "text-danger",
                    line.tone === "step" && "text-muted",
                  )}
                >
                  {line.marker}
                </span>
                <span
                  className={cn(
                    "min-w-0",
                    line.tone === "step" ? "text-muted" : "text-foreground",
                  )}
                >
                  {line.text}
                </span>
                {line.suffix ? (
                  <span className="ml-auto shrink-0 text-muted tabular-nums">
                    {line.suffix}
                  </span>
                ) : null}
              </li>
            ))}
            {pending ? (
              <li className="flex items-baseline gap-3 font-mono text-[12px] leading-relaxed">
                <span className="shrink-0 text-muted tabular-nums">
                  {pending.time}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-bold",
                    pending.tone === "start" && "text-primary",
                    pending.tone === "done" && "text-[#12490F]",
                    pending.tone === "fail" && "text-danger",
                    pending.tone === "step" && "text-muted",
                  )}
                >
                  {pending.marker}
                </span>
                <span
                  className={cn(
                    "min-w-0",
                    pending.tone === "step" ? "text-muted" : "text-foreground",
                  )}
                >
                  {pending.text.slice(0, typed)}
                  <span
                    className="ml-px inline-block h-3 w-[6px] translate-y-px bg-primary"
                    style={{ animation: "blink 1s step-end infinite" }}
                    aria-hidden="true"
                  />
                </span>
              </li>
            ) : null}
          </ol>
        )}
      </div>
    </div>
  );
}

type Line = {
  key: string;
  time: string;
  marker: string;
  text: string;
  suffix?: string;
  tone: "start" | "step" | "done" | "fail";
  /** How long to wait before revealing this line, derived from the real one. */
  delayMs: number;
};

/**
 * Real duration → playback delay.
 *
 * A run that took twenty seconds should not take twenty seconds to read, so
 * the recorded timings are compressed — but *proportionally*, so a phase that
 * genuinely dominated the run still visibly dominates the playback. Clamped at
 * both ends: below the floor nothing registers as a separate line, above the
 * ceiling one slow phase stalls the whole log.
 */
function playbackDelay(durationMs: number | null): number {
  if (durationMs === null) return 220;
  return Math.min(900, Math.max(140, durationMs / 12));
}

/**
 * Turns published executions into log lines.
 *
 * Ordered oldest execution first so the console reads downward like a real
 * log. Nothing is synthesised: every line maps to a phase the run recorded.
 */
function toLines(executions: PublicExecution[]): Line[] {
  const lines: Line[] = [];

  for (const execution of [...executions].reverse()) {
    const started = new Date(execution.started_at);
    lines.push({
      key: execution.id,
      time: clock(started),
      marker: "▸",
      text: `${execution.kind} started`,
      tone: "start",
      delayMs: 320,
    });

    let offset = 0;
    for (const step of execution.steps) {
      if (step.state === "waiting") continue;
      offset += step.duration_ms ?? 0;

      lines.push({
        key: `${execution.id}-${step.label}`,
        time: clock(new Date(started.getTime() + offset)),
        marker: step.state === "failed" ? "✕" : "·",
        text: step.label,
        suffix: step.duration_ms !== null ? `${step.duration_ms} ms` : undefined,
        tone: step.state === "failed" ? "fail" : "step",
        delayMs: playbackDelay(step.duration_ms),
      });
    }

    lines.push({
      key: `${execution.id}-end`,
      time: clock(new Date(started.getTime() + (execution.elapsed_ms ?? 0))),
      marker: execution.status === "failed" ? "✕" : "✓",
      text:
        execution.status === "failed"
          ? "Execution stopped"
          : `Completed · ${execution.findings} findings from ${execution.sources} sources`,
      suffix:
        execution.elapsed_ms !== null
          ? `${(execution.elapsed_ms / 1000).toFixed(1)}s`
          : undefined,
      tone: execution.status === "failed" ? "fail" : "done",
      delayMs: 420,
    });
  }

  return lines;
}

function clock(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour12: false });
}

function ConsoleSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((index) => (
        <div
          key={index}
          className="h-3.5 animate-pulse rounded bg-border"
          style={{
            width: `${[62, 84, 71, 90, 48][index]}%`,
            animationDelay: `${index * 90}ms`,
          }}
        />
      ))}
    </div>
  );
}

function EmptyConsole() {
  return (
    <div className="py-10 text-center">
      <p className="font-mono text-[12px] font-bold text-foreground">
        No public executions yet
      </p>
      <p className="mx-auto mt-2 max-w-sm font-mono text-[11px] leading-relaxed text-muted">
        Executions are private to whoever ran them. This console streams only
        the ones their owners published — nothing is simulated here.
      </p>
    </div>
  );
}

export { ExecutionConsole };
