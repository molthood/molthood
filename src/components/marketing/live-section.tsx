import * as React from "react";

import { Container } from "@/components/layout/container";
import { Heading } from "@/components/layout/heading";
import { Section } from "@/components/layout/section";
import { LiveExecution } from "@/components/marketing/live-execution";
import { Reveal } from "@/components/motion/reveal";

/**
 * Real executions, or an honest empty state.
 *
 * The panel is a server component wrapping one client island, so the streaming
 * connection is the only JavaScript this section costs — the heading and copy
 * ship as HTML.
 */
function LiveSection() {
  return (
    <Section spacing="md" containerSize="xl" divided>
      <Container size="xl">
        <Reveal preset="fadeUp">
          <div className="flex max-w-2xl flex-col gap-3">
            <Heading as="h2" size="lg" weight="semibold">
              Watch an execution as it happens
            </Heading>
            <p className="text-base leading-relaxed font-medium text-muted">
              Each run moves through the same phases and reports what it found
              at every one. Nothing below is a demonstration — these are real
              executions their owners chose to publish, and the panel stays
              empty until somebody does.
            </p>
          </div>
        </Reveal>

        <Reveal preset="fadeUp" delay={0.1} className="mt-8">
          <LiveExecution />
        </Reveal>
      </Container>
    </Section>
  );
}

export { LiveSection };
