import * as React from "react";
import { ArrowUpRight, Blocks, KeyRound, Network, Terminal } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { DOCS_URL, SITE_URL } from "@/config/site";
import { itemsInPhase } from "@/config/roadmap";

/**
 * What stands in for the developer platform while it is being built.
 *
 * Not an empty page with an apology on it. The platform's shape is already
 * decided and written down, so this says what it will be and points at the two
 * documents that carry the detail. A visitor should leave knowing more than
 * they arrived with, which is the only thing that distinguishes a holding page
 * from a dead end.
 *
 * The capability list is read from the roadmap rather than typed here, so it
 * cannot describe a platform the roadmap disagrees with.
 */
const ICONS = [Network, KeyRound, Terminal, Blocks];

export function ComingSoonSurface() {
  // What the platform will consist of, from the phases that are not shipped.
  const upcoming = [...itemsInPhase("Current"), ...itemsInPhase("Next")].slice(0, 4);

  return (
    <main className="molthood-dark molthood-dark-page bg-background flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-16 sm:px-8">
        <a href={SITE_URL} className="self-start transition-opacity hover:opacity-80">
          <Logo />
        </a>

        {/* CSS rather than an asset: crisp at any density, no request, and it
            cannot fail to load and leave a hole in the middle of the page. */}
        <div className="relative mt-12 flex h-28 items-end gap-1.5" aria-hidden="true">
          {[38, 62, 30, 84, 52, 96, 44, 70].map((height, index) => (
            <span
              key={index}
              className="bg-primary/25 flex-1 rounded-t-sm"
              style={{ height: `${height}%` }}
            />
          ))}
          <span className="from-background absolute inset-0 bg-gradient-to-t to-transparent" />
        </div>

        <span className="border-border-strong text-muted mt-8 inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold">
          <span className="bg-muted size-1.5 rounded-full" />
          In development
        </span>

        <h1 className="font-display text-foreground mt-4 text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
          The developer platform is currently under development
        </h1>

        <p className="text-muted mt-4 max-w-[46rem] text-[15px] leading-relaxed font-medium sm:text-base">
          Molthood&rsquo;s analysis engine is live and usable today through the
          console and Molthood Agent. The developer platform — keys, the public
          API, the SDK and the rest of the tooling around them — is being built,
          and it is hidden rather than shown half-finished. An interface that
          does not work yet costs you a click to discover; this page does not.
        </p>

        <div className="border-border mt-10 rounded-card border">
          <p className="text-muted border-border border-b px-5 py-3 font-mono text-[11px] font-bold tracking-[0.14em] uppercase">
            What it will include
          </p>
          <ul className="divide-border divide-y">
            {upcoming.map((item, index) => {
              const Icon = ICONS[index % ICONS.length];
              return (
                <li key={item.id} className="flex items-start gap-3 px-5 py-4">
                  <Icon className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="text-foreground block text-sm font-bold">
                      {item.title}
                    </span>
                    <span className="text-muted mt-0.5 block text-[13px] leading-relaxed font-medium">
                      {item.description}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          <a
            href={`${DOCS_URL}/platform/dashboard`}
            className="bg-primary text-background hover:bg-primary-hover inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-bold transition-colors"
          >
            Read the documentation
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
          <a
            href={`${DOCS_URL}/roadmap`}
            className="border-border hover:border-border-strong text-foreground inline-flex h-10 items-center gap-1.5 rounded-lg border px-4 text-sm font-bold transition-colors"
          >
            See the roadmap
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
          <a
            href={`${SITE_URL}/askmoltagent`}
            className="text-muted hover:text-foreground inline-flex h-10 items-center rounded-lg px-3 text-sm font-bold transition-colors"
          >
            Use Molthood Agent
          </a>
        </div>
      </div>
    </main>
  );
}
