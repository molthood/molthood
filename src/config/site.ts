/**
 * The three hostnames this product is served from.
 *
 * Every surface — marketing, docs, console — is one Next.js app behind a
 * different host, and `src/middleware.ts` maps each host onto its routes. That
 * makes **relative links between surfaces wrong**, and wrong in a way that
 * looks fine locally: `/docs` from console.molthood.org is rewritten into the
 * console's own routes and 404s. It shipped exactly that way once.
 *
 * So a link that crosses a surface uses one of these. A link that stays inside
 * one stays relative.
 *
 * Overridable so a preview deployment points at itself rather than at
 * production, which is otherwise the one link that always escapes the preview.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://molthood.org";

export const DOCS_URL =
  process.env.NEXT_PUBLIC_DOCS_URL ?? "https://docs.molthood.org";

export const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "https://dashboard.molthood.org";

export const CONSOLE_URL =
  process.env.NEXT_PUBLIC_CONSOLE_URL ?? "https://console.molthood.org";

/** The public repository. Checked before being linked — it answers 200. */
export const GITHUB_URL = "https://github.com/molthood";

/** The X account. */
export const X_URL = "https://x.com/molthood_org";

/** The handle alone, for the Twitter card's `site` and `creator` fields. */
export const X_HANDLE = "@molthood_org";

export const siteConfig = {
  name: "Molthood",
  tagline: "AI Execution Agents for Robinhood Chain.",
  description:
    "Molthood is an AI execution platform built exclusively for Robinhood Chain. One request, multiple agents, zero manual work.",
  url: "https://molthood.org",
  chain: "Robinhood Chain",
  links: {
    console: CONSOLE_URL,
    docs: DOCS_URL,
    dashboard: DASHBOARD_URL,
    // The API *reference* lives inside the docs. The `api.` hostname belongs
    // to the API itself — the thing that actually answers requests — and a
    // documentation page cannot have it.
    api: `${DOCS_URL}/api`,
    github: GITHUB_URL,
    x: X_URL,
    agent: `${SITE_URL}/askmoltagent`,
  },
} as const;

export type NavItem = {
  label: string;
  href: string;
  external?: boolean;
  /**
   * The pathname that marks this item current.
   *
   * Needed because a cross-surface link is an absolute URL, and comparing one
   * to `usePathname()` never matches — every such item would render as
   * inactive on the page it points at.
   */
  activePath?: string;
};

/**
 * Primary top-navigation links.
 *
 * Four entries, not six. "API" left the header when the reference became a
 * documentation page rather than a destination of its own, and the console
 * keeps its own button beside this list — an application people are asked to
 * open should look like a call to action, not like a fifth link.
 */
export const mainNav: NavItem[] = [
  // Absolute, but not `external`: the same product on another path, so it
  // navigates in place rather than opening a tab with an outbound-link icon
  // promising somebody else's site.
  {
    label: "Ask Molthood Agent",
    href: `${SITE_URL}/askmoltagent`,
    activePath: "/askmoltagent",
  },
  { label: "Docs", href: DOCS_URL },
  { label: "GitHub", href: GITHUB_URL, external: true },
  { label: "X", href: X_URL, external: true },
];

/**
 * Footer links.
 *
 * Wider than the header on purpose. A header is a decision — four things
 * somebody might want next — and a footer is an index, where the entries the
 * header had to drop still have to be reachable.
 */
export const footerNav: NavItem[] = [
  { label: "Ask Molthood Agent", href: `${SITE_URL}/askmoltagent`, activePath: "/askmoltagent" },
  { label: "Console", href: CONSOLE_URL },
  { label: "Dashboard", href: DASHBOARD_URL },
  { label: "Docs", href: DOCS_URL },
  { label: "API reference", href: `${DOCS_URL}/api` },
  { label: "Roadmap", href: `${DOCS_URL}/roadmap` },
  { label: "GitHub", href: GITHUB_URL, external: true },
  { label: "X", href: X_URL, external: true },
];
