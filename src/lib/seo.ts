import type { Metadata } from "next";

import { SITE_URL, X_HANDLE, siteConfig } from "@/config/site";

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
/** The brand card, and the developer-platform card. */
export const OG_BRAND = `${SITE_URL}/og.png`;
export const OG_DOCS = `${SITE_URL}/og-docs.png`;

export function pageMetadata({
  title,
  description,
  url,
  image = OG_BRAND,
}: {
  title: string;
  description: string;
  /** Absolute URL of this page on the host that serves it. */
  url?: string;
  /** Which card to show. Defaults to the brand one. */
  image?: string;
}): Metadata {
  const headline = `${title} — ${siteConfig.name}`;
  const card = [{ url: image, width: 1200, height: 630, alt: headline }];

  return {
    title,
    description,
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      title: headline,
      description,
      images: card,
      ...(url ? { url } : {}),
    },
    twitter: {
      card: "summary_large_image",
      site: X_HANDLE,
      creator: X_HANDLE,
      title: headline,
      description,
      images: card,
    },
  };
}
