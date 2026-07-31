import type { Metadata } from "next";

import { X_HANDLE, siteConfig } from "@/config/site";

/**
 * Per-page metadata, including the social card.
 *
 * `openGraph.title` does **not** inherit from a page's `title` — Next merges
 * the root's `openGraph` block wholesale, so a page without its own kept
 * advertising the landing page's headline. Every shared documentation link
 * previewed as "AI Execution Agents for Robinhood Chain" regardless of what it
 * pointed at.
 *
 * `canonical` is absolute because each surface is served from its own host. A
 * relative one resolves against `metadataBase`, which is the marketing site,
 * and would tell a crawler that a docs page lives at molthood.org.
 */
export function pageMetadata({
  title,
  description,
  url,
}: {
  title: string;
  description: string;
  /** Absolute URL of this page on the host that serves it. */
  url?: string;
}): Metadata {
  const headline = `${title} — ${siteConfig.name}`;

  return {
    title,
    description,
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      title: headline,
      description,
      ...(url ? { url } : {}),
    },
    twitter: {
      card: "summary_large_image",
      site: X_HANDLE,
      creator: X_HANDLE,
      title: headline,
      description,
    },
  };
}
