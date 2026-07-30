import * as React from "react";

import { SectionHeading } from "@/components/layout/heading";
import { Section } from "@/components/layout/section";
import { Pipeline } from "@/components/marketing/pipeline";
import { Reveal } from "@/components/motion/reveal";

function PipelineSection() {
  return (
    <Section spacing="lg" containerSize="xl" id="pipeline" divided>
      <Reveal>
        <SectionHeading
          eyebrow="Execution Pipeline"
          title="Every request follows the same five stages."
          description="The path from request to report is fixed and inspectable. You always know which stage a run is in and what it produced along the way."
          align="center"
        />
      </Reveal>

      <div className="mt-12">
        <Pipeline />
      </div>
    </Section>
  );
}

export { PipelineSection };
