"use client";

import * as React from "react";
import {
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Package,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";

import { ErrorState } from "@/components/console/error-state";
import { SectionHeader } from "@/components/console/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { api, artifactUrl } from "@/lib/api/client";
import type { ExecutionArtifact, ReportSection } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const ARTIFACT_ICON: Record<ExecutionArtifact["kind"], LucideIcon> = {
  report: FileText,
  data: FileJson,
  table: FileSpreadsheet,
  chart: ImageIcon,
  image: ImageIcon,
  bundle: Package,
  log: FileText,
};

/**
 * Two sections carry meaning by existing at all.
 *
 * "Warnings" and "Not established" are printed by the builder even when empty,
 * because "we checked and found nothing" and "we did not look" must not read
 * the same. The console marks them so an empty one is visibly a statement
 * rather than a gap.
 */
const ALWAYS_PRESENT = new Set(["Warnings", "Not established"]);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Very small markdown renderer for report bodies.
 *
 * The bodies are written by our own builder, so the syntax it emits is known
 * and finite: bold, inline code, links, and list items. Pulling in a full
 * markdown parser to render four constructs would ship a parser's worth of
 * attack surface for no gain.
 */
function Body({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {text.split("\n").map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        const bullet = trimmed.startsWith("- ");
        return (
          <p
            key={index}
            className={cn(
              "text-sm leading-relaxed font-medium text-muted",
              bullet && "pl-4 -indent-2",
            )}
          >
            {bullet ? "• " : null}
            {inline(bullet ? trimmed.slice(2) : trimmed)}
          </p>
        );
      })}
    </div>
  );
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function inline(text: string): React.ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className="rounded-[4px] border border-border bg-surface-raised px-[0.3em] py-[0.1em] font-mono text-[0.86em] font-semibold text-foreground"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      return (
        <a
          key={index}
          href={link[2]}
          target="_blank"
          rel="noreferrer noopener"
          className="font-semibold text-primary underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary"
        >
          {link[1]}
        </a>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function ExecutionReportView({ executionId }: { executionId: string }) {
  const report = useApi(
    (signal) => api.report(executionId, signal),
    [executionId],
  );

  if (report.initialLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (report.error) {
    return <ErrorState error={report.error} onRetry={report.refetch} />;
  }

  const sections: ReportSection[] = report.data?.sections ?? [];
  const artifacts: ExecutionArtifact[] = report.data?.artifacts ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5 sm:p-6">
        <SectionHeader
          title={report.data?.title ?? "Report"}
          description={`${sections.length} section(s), derived from the execution on read.`}
          actions={
            <Button
              size="sm"
              variant="secondary"
              onClick={report.refetch}
              disabled={report.loading}
            >
              <RefreshCw aria-hidden="true" />
              Refresh
            </Button>
          }
        />

        <div className="mt-6 flex flex-col gap-6">
          {sections.map((section) => (
            <section key={section.heading}>
              <h3 className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
                {section.heading}
                {ALWAYS_PRESENT.has(section.heading) ? (
                  <span
                    className="font-mono text-[10px] font-bold text-muted"
                    title="Always reported, so an empty result is a statement rather than a gap."
                  >
                    always shown
                  </span>
                ) : null}
              </h3>
              <div className="mt-2">
                <Body text={section.body} />
              </div>
            </section>
          ))}
        </div>
      </Card>

      {artifacts.length ? (
        <Card className="p-5 sm:p-6">
          <SectionHeader
            title="Files"
            description="Produced from this execution. The bundle contains every other file."
          />
          <ul className="mt-5 flex flex-col gap-2">
            {artifacts.map((artifact) => {
              const Icon = ARTIFACT_ICON[artifact.kind] ?? FileText;
              return (
                <li
                  key={artifact.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3"
                >
                  <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[13px] font-bold text-foreground">
                      {artifact.filename}
                    </span>
                    {artifact.description ? (
                      <span className="block text-xs font-medium text-muted">
                        {artifact.description}
                      </span>
                    ) : null}
                  </span>
                  <Badge variant="outline">{formatBytes(artifact.size_bytes)}</Badge>
                  {/* A plain link, so the browser renders markdown inline and
                      saves a bundle — which a JSON envelope could not do. */}
                  <a
                    href={artifactUrl(executionId, artifact.filename)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    View
                  </a>
                  <a
                    href={artifactUrl(executionId, artifact.filename, {
                      download: true,
                    })}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-bold text-foreground transition-colors hover:border-border-strong"
                  >
                    <Download className="size-3" aria-hidden="true" />
                    Download
                  </a>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

export { ExecutionReportView };
