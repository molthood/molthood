import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

import { DOCS_URL } from "@/config/site";
import type { RoadmapPhase } from "@/config/roadmap";
import { cn } from "@/lib/utils";

/**
 * The page for a feature that does not exist yet.
 *
 * One component, so an unbuilt feature cannot accidentally be presented two
 * different ways. It replaced a mixture of disabled buttons and empty panels
 * that each *looked* like an interface — and an interface that does nothing is
 * worse than no interface, because it takes a click to discover.
 *
 * The rule it encodes: **describe the thing, never simulate it.** No greyed-out
 * form, no fake table, no example response dressed up as a real one. A reader
 * should finish this page knowing what the feature will do and be certain it
 * is not available.
 */

const PHASE_TONE: Record<RoadmapPhase, string> = {
  Current: "border-primary/40 text-primary",
  Next: "border-border-strong text-foreground",
  Planned: "border-border-strong text-muted",
  Future: "border-border-strong text-muted",
  Shipped: "border-primary/40 text-primary",
};

export type ComingSoonProps = {
  icon: LucideIcon;
  title: string;
  /** One sentence: what it is. */
  description: string;
  /** The roadmap bucket this sits in. */
  phase?: RoadmapPhase;
  /** Two or three short paragraphs: what it becomes, and why it matters. */
  detail: string[];
  /** Concrete capabilities, as chips. */
  capabilities?: string[];
  className?: string;
};

function ComingSoon({
  icon: Icon,
  title,
  description,
  phase,
  detail,
  capabilities,
  className,
}: ComingSoonProps) {
  return (
    <section
      className={cn(
        "rounded-card border-border bg-surface-raised relative overflow-hidden border",
        className,
      )}
    >
      {/* Decorative, and CSS rather than an asset: it stays crisp at any
          density, costs no request, and cannot fail to load and leave a hole. */}
      <span
        aria-hidden="true"
        className="border-border pointer-events-none absolute -top-24 -right-20 size-56 rounded-full border opacity-40"
      />
      <span
        aria-hidden="true"
        className="border-border pointer-events-none absolute -top-16 -right-12 size-40 rounded-full border opacity-30"
      />

      <div className="relative p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <span className="border-border bg-background inline-flex size-11 items-center justify-center rounded-xl border">
            <Icon className="text-primary size-5" aria-hidden="true" />
          </span>
          <span className="border-border-strong text-muted inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold">
            <span
              className="bg-muted size-1.5 rounded-full"
              aria-hidden="true"
            />
            Coming soon
          </span>
          {phase ? (
            <span
              className={cn(
                "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold",
                PHASE_TONE[phase],
              )}
            >
              {phase}
            </span>
          ) : null}
        </div>

        {/* `h1`, not `h2`. This card *is* the page — the surrounding shell
            contributes no heading, so an `h2` left the document with no level-1
            heading at all and nothing for a screen reader to land on. */}
        <h1 className="font-display text-foreground mt-5 text-xl font-bold tracking-[-0.02em] sm:text-2xl">
          {title}
        </h1>
        <p className="text-muted mt-2 max-w-[44rem] text-[15px] leading-relaxed font-medium">
          {description}
        </p>

        <div className="mt-5 flex max-w-[44rem] flex-col gap-3">
          {detail.map((paragraph) => (
            <p
              key={paragraph.slice(0, 40)}
              className="text-muted text-sm leading-relaxed font-medium"
            >
              {paragraph}
            </p>
          ))}
        </div>

        {capabilities && capabilities.length > 0 ? (
          <ul className="mt-6 flex flex-wrap gap-1.5">
            {capabilities.map((capability) => (
              <li
                key={capability}
                className="border-border text-muted rounded-md border px-2 py-1 text-xs font-medium"
              >
                {capability}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-7 flex flex-wrap gap-2">
          <a
            href={`${DOCS_URL}/roadmap`}
            className="border-border hover:border-border-strong hover:bg-surface text-foreground inline-flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-[13px] font-bold transition-colors"
          >
            See the roadmap
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
          <Link
            href="/"
            className="text-muted hover:text-foreground inline-flex h-9 items-center rounded-lg px-3 text-[13px] font-bold transition-colors"
          >
            Back to overview
          </Link>
        </div>
      </div>
    </section>
  );
}

export { ComingSoon };
