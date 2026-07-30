import type { Metadata } from "next";

import { PageHead, Panel } from "@/components/dashboard/status-badge";

export const metadata: Metadata = { title: "Changelog" };

/**
 * Real entries only.
 *
 * A fabricated release history is the single fastest way to lose a developer's
 * trust, because it is checkable: they read v0.9 "Webhooks shipped", look for
 * webhooks, and now doubt everything else on the site. Molthood is at its first
 * public version, and the honest thing is to say so.
 */
export default function ChangelogPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHead title="Changelog">
        Developer platform releases. This page starts when the API does — there
        is no back catalogue, and inventing one would be the first thing here a
        reader could check and disprove.
      </PageHead>

      <Panel title="Current" description="What is live right now.">
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-border bg-surface-raised px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <code className="font-mono text-[13px] font-bold text-foreground">
                Platform
              </code>
              <span className="rounded-md border border-[#12490F]/30 bg-[#12490F]/[0.07] px-2 py-0.5 text-[11px] font-bold text-[#12490F]">
                Live
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed font-medium text-muted">
              Analyses for tokens, wallets, contracts, and websites. Evidence
              carries its source and states whether a check was confirmed,
              refuted, or could not run. Reports and downloadable artifacts,
              change detection between runs, and a watchlist.
            </p>
          </div>
          <div className="rounded-lg border border-border px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <code className="font-mono text-[13px] font-bold text-foreground">
                Developer API
              </code>
              <span className="rounded-md border border-primary/30 bg-primary/[0.07] px-2 py-0.5 text-[11px] font-bold text-primary">
                In development
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed font-medium text-muted">
              The interface is designed and published on the endpoints page. It
              does not accept requests yet.
            </p>
          </div>
        </div>
      </Panel>

      <Panel
        title="Next"
        description="Milestones in order. Each becomes an entry above when it is genuinely usable — not when it is merged."
      >
        <ol className="flex flex-col gap-2">
          {[
            "Public API with scoped keys and documented limits",
            "Official MCP server",
            "CLI",
            "SDKs for TypeScript, Python, and Go",
            "Skills: publish, version, install",
            "Webhooks with signed delivery",
          ].map((item, index) => (
            <li
              key={item}
              className="flex items-baseline gap-3 text-sm font-medium text-muted"
            >
              <span className="font-mono text-[11px] font-bold text-border-strong">
                {String(index + 1).padStart(2, "0")}
              </span>
              {item}
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
