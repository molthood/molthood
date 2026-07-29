import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Grid } from "@/components/layout/grid";
import { Heading, SectionHeading } from "@/components/layout/heading";
import { Section } from "@/components/layout/section";
import { Reveal, RevealItem, Stagger } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { docsSections, quickStartSnippet } from "@/config/docs";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Documentation",
  description: `Guides, references, and examples for building on ${siteConfig.name}.`,
};

export default function DocsPage() {
  return (
    <>
      <Section bare spacing="none" className="border-b border-border pt-10 pb-12 sm:pt-12">
        <Container size="xl">
          <Reveal immediate className="flex max-w-2xl flex-col gap-5">
            <Badge variant="primary">Documentation</Badge>
            <Heading as="h1" size="xl" weight="semibold">
              Everything you need to run work on {siteConfig.chain}.
            </Heading>
            <p className="text-base leading-relaxed text-muted sm:text-lg">
              Start with the execution model, then move to the guides and API reference.
              The documentation tracks the platform as each phase ships.
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="w-full sm:w-auto">
                <Link href="#quick-start">Quick Start</Link>
              </Button>
              <Button asChild variant="secondary" className="w-full sm:w-auto">
                <Link href={siteConfig.links.api}>API reference</Link>
              </Button>
            </div>
          </Reveal>
        </Container>
      </Section>

      <Section spacing="md" containerSize="xl" id="quick-start">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
          <Reveal>
            <SectionHeading
              eyebrow="Quick Start"
              title="From a clone to a first execution."
              description="Two servers and one request. There is nothing to install and no credential to present — the local service accepts every request unauthenticated."
              size="lg"
            />
          </Reveal>
          <Reveal preset="scaleIn" delay={0.08}>
            <CodeBlock code={quickStartSnippet} label="bash" />
          </Reveal>
        </div>
      </Section>

      <Section spacing="lg" containerSize="xl" className="border-t border-border">
        <Reveal>
          <SectionHeading
            eyebrow="Sections"
            title="Documentation structure"
            description="The reference is organised around what you are trying to do, not around the internals of the platform."
          />
        </Reveal>

        <Stagger stagger={0.05} className="mt-10">
          <Grid cols={3} gap="md">
            {docsSections.map((section) => {
              const Icon = section.icon;

              return (
                <RevealItem key={section.id}>
                  <Card interactive className="h-full">
                    <CardHeader className="h-full gap-5">
                      <div className="flex items-center justify-between">
                        <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface-raised text-primary">
                          <Icon className="size-[18px]" aria-hidden="true" />
                        </span>
                        <ArrowRight className="size-4 text-muted" aria-hidden="true" />
                      </div>

                      <div className="flex flex-col gap-2">
                        <CardTitle>{section.title}</CardTitle>
                        <CardDescription>{section.description}</CardDescription>
                      </div>

                      <ul className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
                        {section.topics.map((topic) => (
                          <li
                            key={topic}
                            className="flex items-center gap-2 text-sm font-medium text-muted"
                          >
                            <span
                              className="size-1 shrink-0 rounded-full bg-primary"
                              aria-hidden="true"
                            />
                            {topic}
                          </li>
                        ))}
                      </ul>
                    </CardHeader>
                  </Card>
                </RevealItem>
              );
            })}
          </Grid>
        </Stagger>
      </Section>
    </>
  );
}
