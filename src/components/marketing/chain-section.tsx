import * as React from "react";
import Link from "next/link";

import { Heading, Eyebrow } from "@/components/layout/heading";
import { Section } from "@/components/layout/section";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

const commitments = [
  {
    label: "Single network",
    detail: "No multi-chain abstraction layer to reason about or work around.",
  },
  {
    label: "Native primitives",
    detail: `Agents are written against ${siteConfig.chain} directly, not a lowest common denominator.`,
  },
  {
    label: "One execution surface",
    detail: "Every run settles on the same network, so evidence stays comparable.",
  },
];

function ChainSection() {
  return (
    <Section spacing="lg" containerSize="lg" divided>
      <Reveal className="flex flex-col items-center text-center">
        <Eyebrow>Network</Eyebrow>
        <Heading as="h2" size="xl" className="mt-4 max-w-2xl">
          Built exclusively for {siteConfig.chain}.
        </Heading>
        <p className="mt-5 max-w-xl text-base leading-relaxed font-medium text-muted sm:text-lg">
          Molthood is not a general-purpose agent framework pointed at a chain. It is
          built for one network, and every decision in the platform follows from that.
        </p>
      </Reveal>

      <Reveal delay={0.1} className="mt-10">
        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-3">
          {commitments.map((item) => (
            <div key={item.label} className="bg-surface px-6 py-7">
              <dt className="font-display text-[15px] font-bold text-foreground">
                {item.label}
              </dt>
              <dd className="mt-2 text-sm leading-relaxed font-medium text-muted">
                {item.detail}
              </dd>
            </div>
          ))}
        </dl>
      </Reveal>

      <Reveal delay={0.15} className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href={siteConfig.links.console}>Open Console</Link>
        </Button>
        <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
          <Link href={siteConfig.links.api}>Explore the API</Link>
        </Button>
      </Reveal>
    </Section>
  );
}

export { ChainSection };
