import * as React from "react";

import { STATUS_LABEL, type Status } from "@/config/dashboard";
import { cn } from "@/lib/utils";

const TONE: Record<Status, string> = {
  planned: "border-border text-muted",
  "in-development": "border-primary/30 bg-primary/[0.07] text-primary",
  preview: "border-[#12490F]/30 bg-[#12490F]/[0.07] text-[#12490F]",
};

const DOT: Record<Status, string> = {
  planned: "bg-border-strong",
  "in-development": "bg-primary",
  preview: "bg-[#12490F]",
};

/**
 * Status, quietly.
 *
 * A loud "COMING SOON" banner is the visual language of an unfinished project.
 * A small badge is the language of a roadmap — same information, opposite
 * impression, and the impression is the whole point of this surface.
 */
export function StatusBadge({
  status,
  dotOnly = false,
  className,
}: {
  status: Status;
  dotOnly?: boolean;
  className?: string;
}) {
  if (dotOnly) {
    return (
      <span
        className={cn("size-1.5 shrink-0 rounded-full", DOT[status], className)}
        title={STATUS_LABEL[status]}
        aria-label={STATUS_LABEL[status]}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold",
        TONE[status],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT[status])} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PageHead({
  title,
  status,
  children,
}: {
  title: string;
  status?: Status;
  children: React.ReactNode;
}) {
  return (
    <header className="max-w-[42rem]">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[26px] leading-tight font-bold tracking-[-0.02em] text-foreground sm:text-[30px]">
          {title}
        </h1>
        {status ? <StatusBadge status={status} /> : null}
      </div>
      <p className="mt-3 text-[15px] leading-relaxed font-medium text-muted">
        {children}
      </p>
    </header>
  );
}

/**
 * What a feature will be, before it exists.
 *
 * Every page has one. A page that only says "coming soon" tells a developer
 * nothing they can act on and reads as a placeholder; a page that explains the
 * shape of the thing is useful the day it is published, and still useful after.
 */
export function Explainer({
  what,
  why,
  enables,
}: {
  what: string;
  why: string;
  enables: string[];
}) {
  return (
    <section className="rounded-card border border-border bg-surface-raised p-5 sm:p-6">
      <dl className="flex flex-col gap-4">
        <div>
          <dt className="text-[11px] font-bold tracking-wide text-muted uppercase">
            What it is
          </dt>
          <dd className="mt-1 text-sm leading-relaxed font-medium text-foreground">
            {what}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold tracking-wide text-muted uppercase">
            Why it matters
          </dt>
          <dd className="mt-1 text-sm leading-relaxed font-medium text-muted">{why}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold tracking-wide text-muted uppercase">
            What it will enable
          </dt>
          <dd className="mt-2">
            <ul className="flex flex-wrap gap-1.5">
              {enables.map((item) => (
                <li
                  key={item}
                  className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted"
                >
                  {item}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** A control that is designed but not wired. Never pretends otherwise. */
export function DisabledAction({ label, note }: { label: string; note?: string }) {
  return (
    <span
      className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted opacity-70"
      aria-disabled="true"
      title={note ?? "Not available yet."}
    >
      {label}
    </span>
  );
}

export function Panel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-card border border-border p-5 sm:p-6", className)}>
      <h2 className="font-display text-sm font-bold text-foreground">{title}</h2>
      {description ? (
        <p className="mt-1.5 text-sm leading-relaxed font-medium text-muted">
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

const METHOD_TONE: Record<string, string> = {
  GET: "border-primary/30 bg-primary/10 text-primary",
  POST: "border-[#12490F]/30 bg-[#12490F]/10 text-[#12490F]",
  DELETE: "border-danger/30 bg-danger/10 text-danger",
};

export function MethodTag({ method }: { method: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold",
        METHOD_TONE[method] ?? "border-border text-muted",
      )}
    >
      {method}
    </span>
  );
}

/**
 * A snippet describing an interface that does not accept requests yet.
 *
 * Labelled at the block rather than only in prose above it, because a reader
 * skimming for the code is exactly the reader who will not read the paragraph.
 */
export function IllustrativeCode({
  label,
  code,
}: {
  label: string;
  code: string;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <span className="font-mono text-[11px] font-bold text-muted">{label}</span>
        <span className="font-mono text-[10px] font-bold text-muted">illustrative</span>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5">
        <code className="font-mono text-[12.5px] leading-relaxed text-foreground">
          {code}
        </code>
      </pre>
    </div>
  );
}
