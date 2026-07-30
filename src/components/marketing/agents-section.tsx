import * as React from "react";

import { Grid } from "@/components/layout/grid";
import { SectionHeading } from "@/components/layout/heading";
import { Section } from "@/components/layout/section";
import { AgentCard } from "@/components/marketing/agent-card";
import { RevealItem, Stagger, Reveal } from "@/components/motion/reveal";
import { agents } from "@/config/agents";

function AgentsSection() {
  return (
    <Section
      spacing="lg"
      containerSize="xl"
      id="agents"
      divided
    >
      <Reveal>
        <SectionHeading
          eyebrow="Agent Roster"
          title="A specialist for each part of the job."
          description="Agents are narrow on purpose. Each one owns a single domain, and the platform composes them into a plan so no single model has to be right about everything."
        />
      </Reveal>

      <Stagger stagger={0.05} className="mt-10">
        <Grid cols={4} gap="md">
          {agents.map((agent) => (
            <RevealItem key={agent.id}>
              <AgentCard agent={agent} />
            </RevealItem>
          ))}
        </Grid>
      </Stagger>
    </Section>
  );
}

export { AgentsSection };
