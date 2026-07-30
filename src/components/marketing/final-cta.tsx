import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Heading } from "@/components/layout/heading";
import { Section } from "@/components/layout/section";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

/**
 * The close.
 *
 * States the one thing that removes friction — no account, no card — because
 * that is true and it is the objection a reader has at this point. A closing
 * section that repeats the headline in bigger type adds nothing.
 */
function FinalCta() {
  return (
    <Section spacing="lg" containerSize="xl" divided>
      <Container size="xl">
        <Reveal preset="fadeUp">
          <div className="flex flex-col items-start gap-6 rounded-card border border-border bg-surface px-6 py-10 sm:px-10 sm:py-12 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <Heading as="h2" size="md" weight="semibold" className="text-balance">
                Run your first execution
              </Heading>
              <p className="mt-3 text-base leading-relaxed font-medium text-muted">
                Create a key from the console — no account, no card. You get a
                daily allowance because each execution costs real compute, and
                the console shows exactly how much of it is left.
              </p>
            </div>

            <div className="flex w-full shrink-0 flex-col gap-3 sm:flex-row lg:w-auto">
              <Button asChild size="lg" className="group w-full sm:w-auto">
                <Link href={siteConfig.links.console}>
                  Open the console
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
                <Link href={siteConfig.links.docs}>Read the docs</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}

export { FinalCta };
