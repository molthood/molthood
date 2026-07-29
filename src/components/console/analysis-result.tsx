"use client";

import * as React from "react";
import {
  AlertTriangle,
  ExternalLink,
  HelpCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { ChangesCard } from "@/components/console/changes-card";
import { PortfolioCard } from "@/components/console/portfolio-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ExecutionResponse, RiskAssessment } from "@/lib/api/types";
import { formatEvidenceValue, shortenAddress } from "@/lib/format";
import { describeServices, describeSource } from "@/lib/service-labels";
import { cn } from "@/lib/utils";

const RISK_TONE: Record<RiskAssessment["level"], "success" | "warning" | "danger"> = {
  low: "success",
  moderate: "warning",
  elevated: "warning",
  high: "danger",
};

const SEVERITY_TONE: Record<string, "danger" | "warning" | "default"> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "default",
};

function riskOf(result: ExecutionResponse): RiskAssessment | null {
  const risk = result.facts.risk;
  return risk && typeof risk === "object" ? (risk as RiskAssessment) : null;
}

/**
 * Renders one execution result.
 *
 * Evidence and the AI summary are visually separated on purpose: evidence is
 * observed on chain and independently checkable, the summary is generated.
 */
function AnalysisResult({
  result,
  streamingSummary,
}: {
  result: ExecutionResponse;
  /**
   * Prose arriving token by token, before `result.summary` is set. Rendered in
   * place of the "no summary" panel so a live run reads as writing rather than
   * as having failed to write.
   */
  streamingSummary?: string;
}) {
  const risk = riskOf(result);
  const summary = result.summary ?? streamingSummary ?? null;

  // Split by state rather than rendering one flat list. A refuted claim and a
  // check that never ran carry completely different weight, and a single list
  // makes them look like ordinary rows with a blank value.
  const scored = result.evidence.filter(
    (item) => !item.kind.startsWith("risk_") && !item.kind.startsWith("holding_"),
  );
  const contradicted = scored.filter((item) => item.state === "refuted");
  const unverified = scored.filter((item) => item.state === "unknown");
  const observed = scored.filter((item) => item.state === "confirmed");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={result.status === "succeeded" ? "success" : "danger"} dot>
          {result.status}
        </Badge>
        {result.target ? <Badge variant="primary">{result.target}</Badge> : null}
        {result.address ? (
          <Badge variant="outline">{shortenAddress(result.address)}</Badge>
        ) : null}
        <span className="font-mono text-[10px] font-bold text-muted">
          {/* Only confirmed rows are facts. Counting unknowns here would
              inflate the number with checks that never returned. */}
          {result.execution_time_ms} ms · {observed.length} facts
          {contradicted.length ? ` · ${contradicted.length} contradicted` : ""}
          {unverified.length ? ` · ${unverified.length} unchecked` : ""}
        </span>
      </div>

      {result.error ? (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
          <p className="text-sm font-bold text-foreground">Execution failed</p>
          <p className="mt-1 text-sm font-medium text-muted">{result.error}</p>
        </div>
      ) : null}

      {/* --- AI summary, clearly labelled as generated --- */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            <span className="font-display text-[15px] font-bold text-foreground">
              AI Summary
            </span>
          </span>
          {result.summary_model ? (
            <span className="font-mono text-[10px] font-bold text-muted">
              AI-generated
            </span>
          ) : null}
        </div>

        {summary ? (
          <p className="mt-3 text-sm leading-relaxed font-medium text-foreground">
            {summary}
            {result.summary === null && streamingSummary ? (
              <span
                className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-primary"
                aria-hidden="true"
              />
            ) : null}
          </p>
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-border-strong bg-surface-raised/50 px-4 py-4">
            <p className="text-sm font-bold text-foreground">
              No summary generated
            </p>
            <p className="mt-1 text-sm leading-relaxed font-medium text-muted">
              {result.summary_detail ??
                "The summarizer did not produce output for this run."}
            </p>
          </div>
        )}
      </Card>

      {/* --- What moved since last time, above the static picture --- */}
      <ChangesCard facts={result.facts} />

      {/* --- Risk --- */}
      {risk ? (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
              <span className="font-display text-[15px] font-bold text-foreground">
                Risk Assessment
              </span>
            </span>
            <Badge variant={RISK_TONE[risk.level]} dot>
              {risk.score}/100 · {risk.level}
            </Badge>
          </div>

          {risk.signals.length ? (
            <ul className="mt-4 flex flex-col gap-2">
              {risk.signals.map((signal) => (
                <li
                  key={signal.code}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2.5"
                >
                  <span className="min-w-0 text-sm font-medium text-foreground">
                    {signal.detail}
                  </span>
                  <Badge
                    variant={SEVERITY_TONE[signal.severity] ?? "default"}
                    className="shrink-0"
                  >
                    {signal.severity}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm font-medium text-muted">
              No risk signals fired. That means nothing was found, not that the
              subject is proven safe.
            </p>
          )}

          <p className="mt-3 text-xs font-medium text-muted">{risk.basis}</p>
        </Card>
      ) : null}

      {/* --- Holdings, for a wallet --- */}
      <PortfolioCard facts={result.facts} />

      {/* --- Contradicted claims, first because they matter most --- */}
      {contradicted.length ? (
        <Card className="border-danger/30 bg-danger/5 p-5">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-danger" aria-hidden="true" />
            <span className="font-display text-[15px] font-bold text-foreground">
              Claims that do not hold
            </span>
          </span>
          <p className="mt-1 text-sm font-medium text-muted">
            Things this subject states about itself that were checked and found
            false.
          </p>

          <ul className="mt-4 flex flex-col gap-3">
            {contradicted.map((item) => (
              <li key={item.id}>
                <p className="text-sm font-bold text-foreground">{item.label}</p>
                <p className="mt-0.5 text-sm font-medium text-muted">{item.reason}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* --- Evidence --- */}
      {observed.length ? (
        <Card className="p-5">
          <span className="font-display text-[15px] font-bold text-foreground">
            Evidence
          </span>
          <p className="mt-1 text-sm font-medium text-muted">
            Observed on chain. Every row links to where it can be checked.
          </p>

          <ul className="mt-4 flex flex-col divide-y divide-border">
            {observed.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <span className="text-sm font-medium text-muted">{item.label}</span>
                <span className="flex min-w-0 items-center gap-2 sm:justify-end">
                  <span
                    className={cn(
                      "truncate text-sm font-bold text-foreground",
                      typeof item.value === "number" && "tabular-nums",
                    )}
                  >
                    {formatEvidenceValue(item.value)}
                  </span>
                  {item.source_url ? (
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`Verify ${item.label}`}
                      className="shrink-0 text-muted transition-colors hover:text-foreground"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* --- Checks that could not run --- */}
      {unverified.length ? (
        <Card className="p-5">
          <span className="flex items-center gap-2">
            <HelpCircle className="size-4 text-muted" aria-hidden="true" />
            <span className="font-display text-[15px] font-bold text-foreground">
              Could not be checked
            </span>
          </span>
          <p className="mt-1 text-sm font-medium text-muted">
            These were attempted and did not return an answer. Absence here is not
            a clean result — it is a gap.
          </p>

          <ul className="mt-4 flex flex-col gap-3">
            {unverified.map((item) => (
              <li key={item.id}>
                <p className="text-sm font-bold text-foreground">{item.label}</p>
                <p className="mt-0.5 text-sm font-medium text-muted">{item.reason}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* --- Provenance --- */}
      <Card className="p-5">
        <span className="font-display text-[15px] font-bold text-foreground">
          Sources
        </span>
        <ul className="mt-3 flex flex-col gap-2">
          {result.sources.map((source) => (
            <li key={source.url}>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-2 text-sm font-semibold text-foreground transition-opacity hover:opacity-70"
              >
                <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{describeSource(source.label)}</span>
              </a>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3">
          <span className="text-xs font-medium text-muted">
            Agents: {result.agents_used.join(", ") || "—"}
          </span>
          <span className="text-xs font-medium text-muted">
            Sources used: {describeServices(result.services_called)}
          </span>
        </div>
      </Card>

      {/* --- Pipeline trace --- */}
      <Card className="p-5">
        <span className="font-display text-[15px] font-bold text-foreground">
          Pipeline
        </span>
        <ol className="mt-3 flex flex-col gap-1.5">
          {result.stages.map((stage) => (
            <li
              key={stage.stage}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    stage.success ? "bg-[#12490F]" : "bg-danger",
                  )}
                  aria-hidden="true"
                />
                <span className="font-mono text-[11px] font-bold text-muted uppercase">
                  {stage.stage}
                </span>
                <span className="truncate font-medium text-foreground">
                  {stage.summary || stage.error}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[11px] font-bold text-muted tabular-nums">
                {stage.duration_ms} ms
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

export { AnalysisResult };
