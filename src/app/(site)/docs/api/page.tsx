import type { Metadata } from "next";
import Link from "next/link";
import { FileSearch, Network, ShieldCheck } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Grid } from "@/components/layout/grid";
import { Heading, SectionHeading } from "@/components/layout/heading";
import { Section } from "@/components/layout/section";
import { FeatureCard } from "@/components/marketing/feature-card";
import { MethodBadge } from "@/components/marketing/method-badge";
import { Reveal, RevealItem, Stagger } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { apiEndpoints, authSnippet, sdkSnippet, serviceStatus } from "@/config/api";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "API",
  description: `The HTTP and SDK surface for running executions on ${siteConfig.chain}.`,
};

const overview = [
  {
    icon: Network,
    title: "Plain HTTP and JSON",
    description:
      "No SDK to install and no client to keep in sync — every route is a documented GET or POST that curl can drive.",
  },
  {
    icon: FileSearch,
    title: "Evidence carries its source",
    description:
      "Each fact returns with the endpoint it came from, so any figure in a response can be checked against the chain.",
  },
  {
    icon: ShieldCheck,
    title: "Absence is reported, not filled",
    description:
      "When a source has nothing to say the response says so. No field is ever populated with a plausible substitute.",
  },
];

export default function ApiPage() {
  return (
    <>
      <Section bare spacing="none" className="border-b border-border pt-10 pb-12 sm:pt-12">
        <Container size="xl">
          <Reveal immediate className="flex max-w-2xl flex-col gap-5">
            <Badge variant="primary">API</Badge>
            <Heading as="h1" size="xl" weight="semibold">
              One API for every execution on {siteConfig.chain}.
            </Heading>
            <p className="text-base leading-relaxed text-muted sm:text-lg">
              The console is a client of this API — anything you can do in the interface
              is available programmatically, with the same resources and the same
              guarantees.
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="w-full sm:w-auto">
                <Link href="#endpoints">View endpoints</Link>
              </Button>
              <Button asChild variant="secondary" className="w-full sm:w-auto">
                <Link href={siteConfig.links.docs}>Read the docs</Link>
              </Button>
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* Overview */}
      <Section spacing="md" containerSize="xl" id="overview">
        <Reveal>
          <SectionHeading
            eyebrow="Overview"
            title="Designed to be driven by machines."
            description="The console is a client of this API — every figure it shows comes back from one of these routes, with the source attached."
          />
        </Reveal>

        <Stagger className="mt-10">
          <Grid cols={3} gap="md">
            {overview.map((item) => (
              <RevealItem key={item.title}>
                <FeatureCard
                  icon={item.icon}
                  title={item.title}
                  description={item.description}
                />
              </RevealItem>
            ))}
          </Grid>
        </Stagger>
      </Section>

      {/* Authentication */}
      <Section spacing="md" containerSize="xl" id="authentication" className="border-t border-border">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
          <Reveal>
            <SectionHeading
              eyebrow="Authentication"
              title="There isn't any yet."
              description="The service runs locally and accepts every request unauthenticated. Accounts, keys, and tenancy are not built, so nothing here asks you for a token it would only ignore."
              size="lg"
            />
          </Reveal>
          <Reveal preset="scaleIn" delay={0.08}>
            <CodeBlock code={authSnippet} label="curl" />
          </Reveal>
        </div>
      </Section>

      {/* Endpoints */}
      <Section spacing="md" containerSize="xl" id="endpoints" className="border-t border-border">
        <Reveal>
          <SectionHeading
            eyebrow="Endpoints"
            title="The resource surface"
            description="Every path below is transcribed from the running service's OpenAPI document. Analysis routes run the pipeline; the rest read chain data or describe the platform."
          />
        </Reveal>

        <Reveal delay={0.08} className="mt-8">
          <div className="overflow-hidden rounded-card border border-border">
            <ul className="divide-y divide-border">
              {apiEndpoints.map((endpoint) => (
                <li
                  key={`${endpoint.method}-${endpoint.path}`}
                  className="flex flex-col gap-2 bg-surface px-4 py-3.5 transition-colors hover:bg-surface-raised sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <MethodBadge method={endpoint.method} />
                    <code className="truncate text-[13px] text-foreground">
                      {endpoint.path}
                    </code>
                  </div>
                  <p className="text-sm text-muted sm:ml-auto sm:text-right">
                    {endpoint.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </Section>

      {/* Examples */}
      <Section spacing="md" containerSize="xl" id="sdk" className="border-t border-border">
        <Reveal>
          <SectionHeading
            eyebrow="Usage"
            title="Read a response."
            description="There is no published client package. A response carries evidence, the sources behind it, and a summary that declares whether a model produced it."
          />
        </Reveal>

        <div className="mt-8" id="examples">
          <Reveal preset="scaleIn">
            <CodeBlock code={sdkSnippet} label="execution.ts" />
          </Reveal>
        </div>
      </Section>

      {/* Status */}
      <Section spacing="md" containerSize="xl" id="status" className="border-t border-border">
        <Reveal>
          <SectionHeading
            eyebrow="Status"
            title="What is live today."
            description="The engine, the chain and market data, and the AI summaries all run. What is not built is listed as planned rather than left off."
          />
        </Reveal>

        <Reveal delay={0.08} className="mt-8">
          <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2">
            {serviceStatus.map((service) => (
              <li
                key={service.name}
                className="flex items-start justify-between gap-4 bg-surface px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">{service.name}</p>
                  <p className="mt-1 text-sm font-medium text-muted">{service.detail}</p>
                </div>
                <span className="flex shrink-0 items-center gap-2 pt-0.5">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      service.state === "operational" ? "bg-primary" : "bg-border-strong",
                    )}
                    aria-hidden="true"
                  />
                  <span className="font-mono text-[11px] tracking-wide text-muted">
                    {service.state === "operational" ? "Operational" : "Planned"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
      </Section>
    </>
  );
}
