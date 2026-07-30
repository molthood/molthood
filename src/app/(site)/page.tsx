import * as React from "react";
import type { Metadata } from "next";

import { AgentsSection } from "@/components/marketing/agents-section";
import { ChainSection } from "@/components/marketing/chain-section";
import { ExecutionFirst } from "@/components/marketing/execution-first";
import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCta } from "@/components/marketing/final-cta";
import { SectionDivider } from "@/components/layout/divider";
import { Hero } from "@/components/marketing/hero";
import { LiveSection } from "@/components/marketing/live-section";
import { PipelineSection } from "@/components/marketing/pipeline-section";
import { SecuritySection } from "@/components/marketing/security-section";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  // The landing page is the canonical root, so it declares itself rather than
  // inheriting a template that would append the site name twice.
  title: `${siteConfig.name} — ${siteConfig.tagline}`,
  description: siteConfig.description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteConfig.url,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
};

/**
 * Ordered so a first-time reader is convinced before being explained to:
 * what it does, then proof it is running, then how, then on what.
 */
export default function LandingPage() {
  return (
    <>
      {/* Between navigation and hero, aligned to the content container rather
          than the window — a full-bleed rule would cut across a page whose
          content is inset. */}
      <SectionDivider className="pt-1" />
      <Hero />
      <LiveSection />
      <ExecutionFirst />
      <PipelineSection />
      <AgentsSection />
      <ChainSection />
      <SecuritySection />
      <FaqSection />
      <FinalCta />
    </>
  );
}
