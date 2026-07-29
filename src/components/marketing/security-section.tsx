import * as React from "react";
import { ShieldCheck } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Heading } from "@/components/layout/heading";
import { Section } from "@/components/layout/section";
import { Reveal, RevealItem, Stagger } from "@/components/motion/reveal";
import { securityPoints } from "@/config/landing";

/**
 * Four properties a reader can check, rather than four reassurances.
 *
 * "Enterprise-grade security" is the sentence this section exists to avoid.
 * Each item names a specific behaviour and what it rules out, because a claim
 * nobody can verify is worth less than no claim at all.
 */
function SecuritySection() {
  return (
    <Section spacing="md" containerSize="xl" className="border-t border-border">
      <Container size="xl">
        <Reveal preset="fadeUp">
          <div className="flex max-w-2xl flex-col gap-3">
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
              <span className="font-mono text-[11px] font-bold tracking-[0.14em] text-muted uppercase">
                Security
              </span>
            </span>
            <Heading as="h2" size="lg" weight="semibold">
              Built so a mistake stays small
            </Heading>
            <p className="text-base leading-relaxed font-medium text-muted">
              Each of these is a property of how the system is put together, not
              a policy someone has to remember to follow.
            </p>
          </div>
        </Reveal>

        <Stagger stagger={0.06} className="mt-8 grid gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2">
          {securityPoints.map((point) => (
            <RevealItem key={point.title} preset="fadeUp">
              <div className="h-full bg-surface px-6 py-6 transition-colors duration-200 hover:bg-surface-raised">
                <h3 className="font-display text-[15px] font-bold text-foreground">
                  {point.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed font-medium text-muted">
                  {point.detail}
                </p>
              </div>
            </RevealItem>
          ))}
        </Stagger>
      </Container>
    </Section>
  );
}

export { SecuritySection };
