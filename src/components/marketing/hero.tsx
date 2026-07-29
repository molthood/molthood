import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Heading } from "@/components/layout/heading";
import { Section } from "@/components/layout/section";
import { ExecutionConsole } from "@/components/marketing/execution-console";
import { HeroBackground } from "@/components/marketing/hero-background";
import { Reveal, RevealItem, Stagger } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

/**
 * The first thing anyone reads.
 *
 * It answers "what does this actually do" in one sentence, and the sentence is
 * about *checking* rather than about AI. Everything this platform is good at
 * reduces to one behaviour — take a claim, test it against an independent
 * source, and say plainly when a test could not be run. Leading with "AI
 * agents" would describe the machinery and skip the product.
 */
function Hero() {
  return (
    <Section
      bare
      spacing="none"
      className="overflow-hidden pt-14 pb-16 sm:pt-20 sm:pb-20 lg:pt-24 lg:pb-24"
    >
      <HeroBackground />

      <Container size="xl">
        <Stagger
          immediate
          stagger={0.07}
          className="flex max-w-3xl flex-col items-start"
        >
          <RevealItem preset="fadeBlur">
            <Heading as="h1" size="display" weight="semibold" className="text-balance">
              Every claim, checked against
              <br className="hidden sm:block" /> what is actually there.
            </Heading>
          </RevealItem>

          <RevealItem preset="fadeUp" className="mt-6">
            <p className="max-w-2xl text-lg leading-relaxed font-medium text-muted">
              Molthood runs an analysis, gathers evidence from independent
              sources, and reports what it found —{" "}
              <span className="font-semibold text-foreground">
                including the checks it could not make.
              </span>{" "}
              A check that did not run is never shown as a clean result.
            </p>
          </RevealItem>

          <RevealItem preset="fadeUp" className="mt-9 w-full">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg" className="group w-full sm:w-auto">
                <Link href={siteConfig.links.console}>
                  Start an execution
                  <ArrowRight
                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="secondary"
                className="w-full sm:w-auto"
              >
                <Link href={siteConfig.links.docs}>Read the documentation</Link>
              </Button>
            </div>
          </RevealItem>
        </Stagger>

        {/* Proof before explanation: the console shows real executions
            arriving, which argues for the product better than a paragraph. */}
        <Reveal preset="fadeUp" delay={0.28} immediate className="mt-12">
          <ExecutionConsole />
        </Reveal>

        {/* Three properties of the output, not three adjectives about it. */}
        <Reveal preset="fadeUp" delay={0.36} immediate className="mt-10">
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-3">
            {[
              {
                label: "Every finding",
                value: "Carries its source",
                detail: "Each fact links to where it can be checked independently.",
              },
              {
                label: "Every gap",
                value: "Named, not hidden",
                detail: "A failed lookup is reported as a gap, never as a pass.",
              },
              {
                label: "Every run",
                value: "Comparable",
                detail: "Stored, so the next run can say what changed since.",
              },
            ].map((item) => (
              <div key={item.label} className="bg-surface px-6 py-5">
                <dt className="font-mono text-[11px] font-bold tracking-[0.14em] text-muted uppercase">
                  {item.label}
                </dt>
                <dd className="mt-2 font-display text-base font-bold text-foreground">
                  {item.value}
                </dd>
                <p className="mt-1.5 text-sm leading-relaxed font-medium text-muted">
                  {item.detail}
                </p>
              </div>
            ))}
          </dl>
        </Reveal>
      </Container>
    </Section>
  );
}

export { Hero };
