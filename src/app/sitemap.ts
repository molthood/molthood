import type { MetadataRoute } from "next";

import { docsCategories, docsPages } from "@/config/docs";
import { dashboardNav } from "@/config/dashboard";
import { DASHBOARD_URL, DOCS_URL, SITE_URL } from "@/config/site";

/**
 * Every public page, across every host.
 *
 * Absolute URLs because the surfaces are separate hostnames served by one
 * application — a relative entry would claim a docs page lives on the
 * marketing site, which is exactly what the canonical tags exist to deny.
 *
 * The console is deliberately absent. It is an application behind a key, and
 * listing screens that require credentials only teaches a crawler what a
 * redirect looks like.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const marketing = ["", "/askmoltagent"].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.9,
  }));

  const docs = [
    { url: DOCS_URL, lastModified: now, changeFrequency: "weekly" as const, priority: 0.8 },
    // Category indexes, minus the single-page sections whose category *is*
    // their page — those already appear below and would be listed twice.
    ...docsCategories
      .filter(
        (category) =>
          !(category.pages.length === 1 && category.pages[0].slug === ""),
      )
      .map((category) => ({
        url: `${DOCS_URL}/${category.id}`,
        lastModified: now,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    ...docsPages.map(({ href }) => ({
      url: `${DOCS_URL}${href}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];

  const dashboard = dashboardNav.map((item) => ({
    url: `${DASHBOARD_URL}${item.href === "/" ? "" : item.href}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  return [...marketing, ...docs, ...dashboard];
}
