import type { MetadataRoute } from "next";

import { SITE_URL } from "@/config/site";

/**
 * Crawl rules.
 *
 * Served unrewritten on every host: the middleware matcher excludes any path
 * with a file extension, so `/robots.txt` reaches this handler rather than
 * being prefixed into a surface's routes and 404ing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Route handlers, not pages. Nothing here renders, and a crawler
      // following them would only ever collect errors.
      disallow: ["/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
