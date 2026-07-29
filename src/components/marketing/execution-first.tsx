import * as React from "react";
import { FileCheck2, GitBranch, Terminal } from "lucide-react";

import { Grid } from "@/components/layout/grid";
import { SectionHeading } from "@/components/layout/heading";
import { Section } from "@/components/layout/section";
import { FeatureCard } from "@/components/marketing/feature-card";
import { Reveal, RevealItem, Stagger } from "@/components/motion/reveal";

const principles = [
  {
    icon: Terminal,
    title: "Requests, not prompts",
    description:
      "You describe an outcome. Molthood decides which agents are required, in what order, and with which inputs.",
  },
  {
    icon: GitBranch,
    title: "Work that completes",
    description:
      "Steps run to completion against the network. Nothing stops at a suggestion you still have to carry out yourself.",
  },
  {
    icon: FileCheck2,
    title: "Evidence by default",
    description:
      "Every stage emits an artifact as it finishes, so a finished run is something you can audit rather than trust.",
  },
];

function ExecutionFirst() {
  return (
    <Section spacing="lg" id="execution-first">
      <Reveal>
        <SectionHeading
          eyebrow="Execution First"
          title="Most tools answer. Molthood finishes the work."
          description="A language model that returns a plan still leaves the entire job on your desk. Molthood is built the other way around — the platform treats a request as work to be carried out, and the response is the completed result."
        />
      </Reveal>

      <Stagger className="mt-10">
        <Grid cols={3} gap="md">
          {principles.map((principle) => (
            <RevealItem key={principle.title}>
              <FeatureCard
                icon={principle.icon}
                title={principle.title}
                description={principle.description}
              />
            </RevealItem>
          ))}
        </Grid>
      </Stagger>
    </Section>
  );
}

export { ExecutionFirst };
