"use client";

import * as React from "react";
import {
  Check,
  ChevronRight,
  Loader2,
  MinusCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import type { AnalysisCard, Confidence, SuggestedAction } from "@/lib/ai/report";
import type { SourceRef } from "@/lib/ai/tools";
import type { TimelineStep } from "@/hooks/use-molt-chat";
import { cn } from "@/lib/utils";

/** Why a step could not run, in words rather than a code. */
const REASONS: Record<string, string> = {
  missing_key: "not configured on this deployment",
  rate_limited: "the shared daily allowance is spent",
  unreachable: "the source could not be reached",
  http_error: "the source returned an error",
  not_found: "nothing found for that subject",
  timeout: "took too long to finish",
};

/**
 * What the assistant is doing, as it does it.
 *
 * A spinner says only that something is happening. This says which part, which
 * ones finished, and — the part that matters — which one could not run and
 * why. A step that failed stays visible; removing it would leave a timeline
 * where everything succeeded.
 */
function Timeline({ steps }: { steps: TimelineStep[] }) {
  if (steps.length === 0) return null;

  return (
    <ol className="border-border bg-surface/60 mb-3 flex flex-col gap-1.5 rounded-xl border px-3 py-2.5">
      {steps.map((step, index) => (
        <li key={`${step.id}-${index}`} className="flex items-start gap-2 text-xs font-medium">
          {step.status === "running" ? (
            <Loader2 className="text-muted mt-px size-3.5 shrink-0 animate-spin" />
          ) : step.status === "ok" ? (
            <Check className="text-primary mt-px size-3.5 shrink-0" />
          ) : (
            <MinusCircle className="text-muted mt-px size-3.5 shrink-0" />
          )}
          <span className="min-w-0">
            <span
              className={step.status === "unavailable" ? "text-muted" : "text-foreground"}
            >
              {step.label}
            </span>
            {step.status === "unavailable" ? (
              <span className="text-muted">
                {" — could not run: "}
                {REASONS[step.reason ?? ""] ?? "unavailable"}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

const CONFIDENCE_LABEL: Record<Confidence["level"], string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  none: "Not verified",
};

const CONFIDENCE_TONE: Record<Confidence["level"], string> = {
  high: "border-primary/40 text-primary",
  medium: "border-border-strong text-foreground",
  low: "border-border-strong text-muted",
  none: "border-border-strong text-muted",
};

/**
 * How much of the answer was actually checked.
 *
 * The reason is not optional. A badge saying "Medium" on its own tells a
 * reader nothing they can act on; "3 of 5 checks completed" tells them exactly
 * what to distrust.
 */
function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold",
          CONFIDENCE_TONE[confidence.level],
        )}
      >
        <ShieldCheck className="size-3" aria-hidden="true" />
        {CONFIDENCE_LABEL[confidence.level]}
      </span>
      <span className="text-muted text-[11px] font-medium">{confidence.reason}</span>
    </div>
  );
}

/**
 * Figures, rendered from the data they were measured in.
 *
 * Never parsed out of the answer. A card built from prose can be wrong in a
 * way that looks identical to one that was measured, which is the worst
 * possible property for the most scannable element on the page.
 */
function Cards({ cards }: { cards: AnalysisCard[] }) {
  if (cards.length === 0) return null;

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2">
      {cards.map((card) => (
        <section
          key={card.id}
          className="border-border bg-surface-raised rounded-xl border p-4"
        >
          <h3 className="font-display text-foreground text-[13px] font-bold">
            {card.title}
          </h3>
          {card.note ? (
            <p className="text-muted mt-1 text-[11px] leading-snug font-medium">
              {card.note}
            </p>
          ) : null}
          <dl className="mt-3 flex flex-col gap-1.5">
            {card.fields.map((entry, index) => (
              <div
                key={`${entry.label}-${index}`}
                className="flex items-baseline justify-between gap-3"
              >
                <dt className="text-muted shrink-0 text-[11px] font-medium">
                  {entry.label}
                </dt>
                <dd
                  className={cn(
                    "min-w-0 truncate text-right text-[13px] font-bold",
                    entry.tone === "warn"
                      ? "text-danger"
                      : entry.emphasis
                        ? "text-primary"
                        : "text-foreground",
                  )}
                >
                  {entry.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/**
 * Where the claims came from.
 *
 * Named by the role each source plays rather than by supplier, with the link
 * beside it. The link is what makes a claim checkable; the role is what makes
 * the list readable without knowing who anybody is.
 */
function Sources({ sources }: { sources: SourceRef[] }) {
  if (sources.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="text-muted font-mono text-[10px] font-bold tracking-[0.14em] uppercase">
        Sources used
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {sources.map((source) =>
          source.url ? (
            <li key={source.role}>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="border-border hover:border-border-strong text-muted hover:text-foreground inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors"
              >
                {source.role}
                <ChevronRight className="size-3" aria-hidden="true" />
              </a>
            </li>
          ) : (
            <li
              key={source.role}
              className="border-border text-muted rounded-md border px-2 py-1 text-[11px] font-medium"
            >
              {source.role}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

/** What to ask next. Deterministic, so they appear the instant an answer ends. */
function Actions({
  actions,
  onPick,
}: {
  actions: SuggestedAction[];
  onPick: (prompt: string) => void;
}) {
  if (actions.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="text-muted font-mono text-[10px] font-bold tracking-[0.14em] uppercase">
        Next
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {actions.map((action) => (
          <li key={action.label}>
            <button
              type="button"
              onClick={() => onPick(action.prompt)}
              className="border-border hover:border-border-strong hover:bg-surface text-foreground inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-colors"
            >
              <Sparkles className="text-primary size-3" aria-hidden="true" />
              {action.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { Actions, Cards, ConfidenceBadge, Sources, Timeline };
