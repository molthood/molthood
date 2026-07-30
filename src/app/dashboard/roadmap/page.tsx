import type { Metadata } from "next";

import { PageHead, StatusBadge } from "@/components/dashboard/status-badge";
import { roadmap } from "@/config/dashboard";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Roadmap" };

const PHASES = ["Now", "Next", "Later"] as const;

export default function RoadmapPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHead title="Roadmap">
        What exists, what is being built, and what follows. No dates — a date
        given early is a promise made with the least information anyone will ever
        have about the work.
      </PageHead>

      <div className="flex flex-col gap-8">
        {PHASES.map((phase) => {
          const entries = roadmap.filter((item) => item.phase === phase);
          if (!entries.length) return null;

          return (
            <section key={phase}>
              <h2 className="font-mono text-[11px] font-bold tracking-[0.14em] text-muted uppercase">
                {phase}
              </h2>
              <ol className="mt-3 flex flex-col">
                {entries.map((entry, index) => (
                  <li key={entry.title} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          entry.status === "shipped"
                            ? "bg-[#12490F]"
                            : entry.status === "in-development"
                              ? "bg-primary"
                              : "bg-border-strong",
                        )}
                      />
                      {index < entries.length - 1 ? (
                        <span className="w-px flex-1 bg-border" />
                      ) : null}
                    </div>
                    <div className="flex-1 pb-6">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-sm font-bold text-foreground">
                          {entry.title}
                        </h3>
                        {entry.status === "shipped" ? (
                          <span className="rounded-md border border-[#12490F]/30 bg-[#12490F]/[0.07] px-2 py-0.5 text-[11px] font-bold text-[#12490F]">
                            Live
                          </span>
                        ) : (
                          <StatusBadge status={entry.status} />
                        )}
                      </div>
                      <p className="mt-1.5 max-w-[42rem] text-sm leading-relaxed font-medium text-muted">
                        {entry.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
