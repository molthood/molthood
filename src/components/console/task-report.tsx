"use client";

import * as React from "react";
import {
  AlertTriangle,
  ExternalLink,
  FileDown,
  HelpCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ArtifactRef, Report, ReportStep } from "@/lib/api/types";
import { formatEvidenceValue } from "@/lib/format";
import { describeProvider } from "@/lib/service-labels";
import { cn } from "@/lib/utils";

const CONFIDENCE_TONE: Record<
  Report["confidence"],
  "success" | "warning" | "danger" | "default"
> = {
  high: "success",
  medium: "warning",
  low: "danger",
  unknown: "default",
};

/**
 * One task report.
 *
 * The timeline is not debug output — it is the part that makes the rest
 * checkable. A reader who cannot see that the crawl never ran has no way to
 * tell thorough coverage from a missing API key, so skipped steps are rendered
 * as prominently as the ones that succeeded.
 */
function TaskReport({ report }: { report: Report }) {
  const contradicted = report.evidence.filter((item) => item.state === "refuted");
  const unverified = report.evidence.filter((item) => item.state === "unknown");
  const observed = report.evidence.filter((item) => item.state === "confirmed");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="primary">{report.kind.replace(/_/g, " ")}</Badge>
        <Badge variant={CONFIDENCE_TONE[report.confidence]} dot>
          {report.confidence} confidence
        </Badge>
        {report.performance.cache_hit ? (
          <Badge variant="default">from cache</Badge>
        ) : null}
        <span className="font-mono text-[10px] font-bold text-muted">
          {report.performance.total_ms} ms · {report.performance.steps_run} ran ·{" "}
          {report.performance.steps_skipped} skipped · {report.sources.length} sources
        </span>
      </div>

      {report.confidence_reason ? (
        <p className="text-sm font-medium text-muted">{report.confidence_reason}</p>
      ) : null}

      {/* --- Blocked, with the exact remedy --- */}
      {report.error ? (
        <Card className="border-danger/30 bg-danger/5 p-5">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-danger" aria-hidden="true" />
            <span className="font-display text-[15px] font-bold text-foreground">
              This task could not run
            </span>
          </span>
          <p className="mt-1 text-sm font-medium text-muted">{report.error}</p>
        </Card>
      ) : null}

      {/* --- What was found --- */}
      {observed.length ? (
        <Card className="p-5">
          <span className="font-display text-[15px] font-bold text-foreground">
            Findings
          </span>
          <ul className="mt-4 flex flex-col divide-y divide-border">
            {observed.map((item, index) => (
              <li
                key={`${item.kind}-${index}`}
                className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <span className="text-sm font-medium text-muted">{item.label}</span>
                <span className="truncate text-sm font-bold text-foreground">
                  {formatEvidenceValue(item.value)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {contradicted.length ? (
        <Card className="border-danger/30 bg-danger/5 p-5">
          <span className="font-display text-[15px] font-bold text-foreground">
            Did not hold
          </span>
          <ul className="mt-3 flex flex-col gap-2">
            {contradicted.map((item, index) => (
              <li key={index}>
                <p className="text-sm font-bold text-foreground">{item.label}</p>
                <p className="mt-0.5 text-sm font-medium text-muted">{item.reason}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {unverified.length ? (
        <Card className="p-5">
          <span className="flex items-center gap-2">
            <HelpCircle className="size-4 text-muted" aria-hidden="true" />
            <span className="font-display text-[15px] font-bold text-foreground">
              Could not be established
            </span>
          </span>
          <ul className="mt-3 flex flex-col gap-2">
            {unverified.map((item, index) => (
              <li key={index}>
                <p className="text-sm font-bold text-foreground">{item.label}</p>
                <p className="mt-0.5 text-sm font-medium text-muted">{item.reason}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* --- Artifacts --- */}
      {report.artifacts.length ? (
        <Card className="p-5">
          <span className="font-display text-[15px] font-bold text-foreground">
            Files produced
          </span>
          <ul className="mt-4 flex flex-col gap-3">
            {report.artifacts.map((artifact) => (
              <ArtifactRow key={artifact.name} artifact={artifact} />
            ))}
          </ul>
        </Card>
      ) : null}

      {/* --- Sources --- */}
      {report.sources.length ? (
        <Card className="p-5">
          <span className="font-display text-[15px] font-bold text-foreground">
            Sources
          </span>
          <p className="mt-1 text-sm font-medium text-muted">
            Every source the task retrieved, with the provider that found it.
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {report.sources.map((source, index) => (
              <li key={`${source.url}-${index}`}>
                <a
                  href={source.url ?? "#"}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-start gap-2 text-sm font-semibold text-foreground transition-opacity hover:opacity-70"
                >
                  <ExternalLink
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block truncate">
                      {source.title ?? source.url}
                    </span>
                    <span className="block font-mono text-[10px] font-bold text-muted">
                      {describeProvider(source.provider)}
                      {source.published_at ? ` · ${source.published_at}` : ""}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* --- The timeline, including what did not run --- */}
      <Card className="p-5">
        <span className="font-display text-[15px] font-bold text-foreground">
          Execution timeline
        </span>
        <p className="mt-1 text-sm font-medium text-muted">
          Every planned step, including the ones that did not run and why.
        </p>
        <ol className="mt-4 flex flex-col gap-2">
          {report.timeline.map((step, index) => (
            <StepRow key={`${step.capability}-${index}`} step={step} />
          ))}
        </ol>

        {report.blocked_by.length ? (
          <p className="mt-4 border-t border-border pt-3 text-xs font-medium text-muted">
            Unblock with{" "}
            <code className="font-mono font-bold text-foreground">
              {report.blocked_by.join(", ")}
            </code>
          </p>
        ) : null}
      </Card>

      {/* --- How the plan was chosen --- */}
      {report.reasoning.length ? (
        <Card className="p-5">
          <span className="font-display text-[15px] font-bold text-foreground">
            Reasoning
          </span>
          <ul className="mt-3 flex flex-col gap-1.5">
            {report.reasoning.map((line, index) => (
              <li key={index} className="text-sm font-medium text-muted">
                — {line}
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-border pt-3 font-mono text-[10px] font-bold text-muted">
            {report.performance.provider_ms} ms summed across providers ·{" "}
            {report.performance.total_ms} ms wall · cache:{" "}
            {report.performance.cache_backend}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function StepRow({ step }: { step: ReportStep }) {
  const ran = step.ok === true;
  const failed = step.ok === false;

  return (
    <li className="flex flex-wrap items-start justify-between gap-2">
      <span className="flex min-w-0 items-start gap-2">
        <span
          className={cn(
            "mt-1.5 size-1.5 shrink-0 rounded-full",
            ran ? "bg-[#12490F]" : failed ? "bg-danger" : "bg-border-strong",
          )}
          aria-hidden="true"
        />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "font-mono text-xs font-bold",
                ran ? "text-foreground" : "text-muted",
              )}
            >
              {step.capability.replace(/_/g, " ")}
            </span>
            {step.required ? (
              <span className="font-mono text-[10px] font-bold text-muted">
                required
              </span>
            ) : null}
          </span>
          {/* The reason a step did not run is the whole point of showing it. */}
          {step.skipped_because ? (
            <span className="mt-0.5 block text-xs font-medium text-muted">
              {step.skipped_because}
            </span>
          ) : step.error ? (
            <span className="mt-0.5 block text-xs font-medium text-danger">
              {step.error}
            </span>
          ) : (
            <span className="mt-0.5 block text-xs font-medium text-muted">
              {step.description}
            </span>
          )}
        </span>
      </span>

      <span className="shrink-0 font-mono text-[10px] font-bold text-muted tabular-nums">
        {step.provider ? describeProvider(step.provider) : "—"}
        {step.duration_ms !== null ? ` · ${step.duration_ms} ms` : ""}
      </span>
    </li>
  );
}

function ArtifactRow({ artifact }: { artifact: ArtifactRef }) {
  const isImage = artifact.kind === "image" && artifact.encoding === "base64";

  return (
    <li className="rounded-lg border border-border bg-surface-raised p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <FileDown className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
          <span className="font-mono text-xs font-bold text-foreground">
            {artifact.name}
          </span>
          <Badge variant="outline">{artifact.kind}</Badge>
        </span>
        <span className="font-mono text-[10px] font-bold text-muted tabular-nums">
          {artifact.size_bytes.toLocaleString()} bytes
        </span>
      </div>

      {/* Rendered inline where the browser can: a chart is the result, not an
          attachment to go and find. */}
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:image/png;base64,${artifact.content}`}
          alt={artifact.name}
          className="mt-3 max-h-80 w-full rounded-md border border-border object-contain"
        />
      ) : artifact.encoding === "utf-8" ? (
        <pre className="mt-3 max-h-48 overflow-auto rounded-md border border-border bg-surface p-2 font-mono text-[11px] text-foreground">
          {artifact.content.slice(0, 2000)}
        </pre>
      ) : null}
    </li>
  );
}

export { TaskReport };
