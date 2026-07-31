import * as React from "react";
import type { Metadata } from "next";

import { AgentsSection } from "@/components/marketing/agents-section";
import { ChainSection } from "@/components/marketing/chain-section";
import { ExecutionFirst } from "@/components/marketing/execution-first";
import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCta } from "@/components/marketing/final-cta";
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
    // Declared rather than left to the file convention. A page that supplies
    // its own `openGraph` object replaces the inherited one wholesale, so the
    // generated image was being dropped exactly where it matters most — the
    // link people actually share.
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }],
  },
};

/**
 * Ordered so a first-time reader is convinced before being explained to:
 * what it does, then proof it is running, then how, then on what.
 */
export default function LandingPage() {
  return (
    <>
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
