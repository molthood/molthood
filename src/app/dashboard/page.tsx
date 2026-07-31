import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PageHead, StatusBadge } from "@/components/dashboard/status-badge";
import { capabilities } from "@/config/dashboard";
import { CONSOLE_URL } from "@/config/site";

export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHead title="Developer platform">
        Molthood is an execution platform: you describe a subject, agents gather
        evidence, and every finding carries the source it came from. The console
        is live today. What follows is how you will reach the same engine from
        your own code.
      </PageHead>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {capabilities.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col rounded-card border border-border p-5 transition-colors hover:border-border-strong"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface-raised text-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <StatusBadge status={item.status} />
              </div>
              <h2 className="mt-4 font-display text-[15px] font-bold text-foreground">
                {item.title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed font-medium text-muted">
                {item.summary}
              </p>
              <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed font-medium text-muted">
                {item.purpose}
              </p>
            </Link>
          );
        })}
      </div>

      <section className="rounded-card border border-border bg-surface-raised p-5 sm:p-6">
        <h2 className="font-display text-sm font-bold text-foreground">
          Available today
        </h2>
        <p className="mt-1.5 max-w-[46rem] text-sm leading-relaxed font-medium text-muted">
          Nothing on this page accepts requests yet. The platform itself does —
          analyses run, evidence is collected, and reports are produced in the
          console. Everything here is about reaching that from outside a
          browser.
        </p>
        <a
          href={CONSOLE_URL}
          className="mt-4 inline-flex items-center gap-2 bg-primary text-background hover:bg-primary-hover rounded-lg px-3.5 py-2 text-xs font-bold transition-colors"
        >
          Open the console
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </a>
      </section>
    </div>
  );
}
