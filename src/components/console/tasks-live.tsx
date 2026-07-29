"use client";

import * as React from "react";
import { Play, Wand2 } from "lucide-react";

import { ApiKeyPanel } from "@/components/console/api-key-panel";
import { InlineError } from "@/components/console/error-state";
import { SectionHeader } from "@/components/console/section-header";
import { TaskReport } from "@/components/console/task-report";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Spinner } from "@/components/ui/loading-state";
import { Switch } from "@/components/ui/switch";
import { useApiAction } from "@/hooks/use-api";
import { useCredential } from "@/hooks/use-credential";
import { api } from "@/lib/api/client";
import type { WorkflowPlan } from "@/lib/api/types";

const EXAMPLES = [
  "research how token honeypot contracts trap sellers",
  "audit https://example.com",
  "https://github.com/pallets/flask",
] as const;

/**
 * Submitting one task.
 *
 * The plan preview is shown before the run rather than after, because it is
 * free and it answers the question that decides whether to spend anything:
 * which steps will actually run on this deployment.
 */
function TasksLive() {
  const { hasKey } = useCredential();
  const [request, setRequest] = React.useState("");
  const [useCache, setUseCache] = React.useState(true);
  const [preview, setPreview] = React.useState<WorkflowPlan | null>(null);

  const task = useApiAction(async () => api.runTask(request.trim(), useCache));

  // Previewing is free and calls no provider, so it can follow the input.
  React.useEffect(() => {
    const trimmed = request.trim();
    if (trimmed.length < 4) {
      setPreview(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const plans = await api.workflows(controller.signal);
        const { classified_as } = await previewKind(trimmed, controller.signal);
        setPreview(plans.items.find((item) => item.kind === classified_as) ?? null);
      } catch {
        // A failed preview must not block the run — it is a convenience.
        setPreview(null);
      }
    }, 400);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [request]);

  if (!hasKey) return <ApiKeyPanel />;

  const canRun = !task.pending && request.trim().length > 3;

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5 sm:p-6">
        <SectionHeader
          title="Run a task"
          description="One request. The router picks the workflow, the manager picks the providers, and the report says what ran and what did not."
        />

        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void task.run();
          }}
        >
          <Field
            label="Request"
            htmlFor="task-request"
            hint="Plain language. A URL becomes a site audit, a fenced code block becomes an execution."
          >
            <textarea
              id="task-request"
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              rows={3}
              placeholder="research how token honeypot contracts trap sellers"
              className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-muted focus:border-border-strong"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted">Try:</span>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setRequest(example)}
                className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground"
              >
                {example.length > 34 ? `${example.slice(0, 34)}…` : example}
              </button>
            ))}
          </div>

          {/* What would run, before anything is spent. */}
          {preview ? (
            <div className="rounded-lg border border-border bg-surface-raised px-4 py-3">
              <span className="flex flex-wrap items-center gap-2">
                <Wand2 className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-sm font-bold text-foreground">
                  {preview.title}
                </span>
                <Badge variant={preview.runnable ? "success" : "warning"} dot>
                  {preview.runnable ? "runnable" : "blocked"}
                </Badge>
              </span>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {preview.steps.map((step) => (
                  <li
                    key={step.capability}
                    className={
                      step.provider
                        ? "rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary"
                        : "rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted line-through"
                    }
                  >
                    {step.capability.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
              {preview.blocked_by.length ? (
                <p className="mt-2 text-xs font-medium text-muted">
                  Set{" "}
                  <code className="font-mono font-bold text-foreground">
                    {preview.blocked_by.join(", ")}
                  </code>{" "}
                  to unblock this.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" disabled={!canRun}>
              {task.pending ? <Spinner /> : <Play aria-hidden="true" />}
              {task.pending ? "Running…" : "Run task"}
            </Button>

            <label className="flex items-center gap-2 text-xs font-medium text-muted">
              <Switch
                checked={useCache}
                onChange={(event) => setUseCache(event.target.checked)}
              />
              Reuse a recent identical run
            </label>
          </div>

          {task.error ? <InlineError error={task.error} /> : null}
        </form>
      </Card>

      {task.data ? <TaskReport report={task.data} /> : null}
    </div>
  );
}

/** The classification alone, so the preview knows which workflow to show. */
async function previewKind(
  request: string,
  signal: AbortSignal,
): Promise<{ classified_as: string }> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
  const response = await fetch(
    `${base}/api/v1/providers/plan?request=${encodeURIComponent(request)}`,
    { signal, cache: "no-store" },
  );
  return (await response.json()) as { classified_as: string };
}

export { TasksLive };
