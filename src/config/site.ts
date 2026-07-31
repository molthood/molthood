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
 * There is no GitHub entry: the source is not published anywhere, and the
 * previous link pointed at github.com's own homepage, which promises a
 * repository and delivers nothing. Add it back alongside a real repository.
 */
export const mainNav: NavItem[] = [
  // Absolute, but not `external`: it is the same product on another host,
  // so it should navigate in place rather than open a tab with an
  // outbound-link icon promising somebody else's site.
  { label: "AI", href: `${SITE_URL}/ai`, activePath: "/ai" },
  { label: "Console", href: CONSOLE_URL },
  { label: "Docs", href: DOCS_URL },
  { label: "Developers", href: DASHBOARD_URL },
  { label: "API", href: `${DOCS_URL}/api` },
];

/** Footer links — intentionally the same surface area as the header. */
export const footerNav: NavItem[] = [
  // Absolute, but not `external`: it is the same product on another host,
  // so it should navigate in place rather than open a tab with an
  // outbound-link icon promising somebody else's site.
  { label: "AI", href: `${SITE_URL}/ai`, activePath: "/ai" },
  { label: "Console", href: CONSOLE_URL },
  { label: "Docs", href: DOCS_URL },
  { label: "Developers", href: DASHBOARD_URL },
  { label: "API", href: `${DOCS_URL}/api` },
];
