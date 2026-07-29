/**
 * Where the console lives, as an absolute URL.
 *
 * Absolute because the marketing site and the console are different hosts. A
 * relative `/console` from molthood.org would land on the marketing site's own
 * 404 — the console's routes exist only under its own hostname.
 *
 * Overridable so a preview deployment can point at itself instead of at
 * production, which is otherwise the one link that always escapes the preview.
 */
/**
 * Where the marketing site and documentation live, as an absolute URL.
 *
 * The console needs this for the same reason the site needs CONSOLE_URL:
 * a relative `/docs` from console.molthood.org is rewritten into the
 * console's own routes and 404s.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://molthood.org";

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
    docs: "/docs",
    api: "/api",
  },
} as const;

export type NavItem = {
  label: string;
  href: string;
  external?: boolean;
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
  { label: "Console", href: CONSOLE_URL },
  { label: "Docs", href: "/docs" },
  { label: "API", href: "/api" },
];

/** Footer links — intentionally the same surface area as the header. */
export const footerNav: NavItem[] = [
  // Absolute, but not `external`: it is the same product on another host,
  // so it should navigate in place rather than open a tab with an
  // outbound-link icon promising somebody else's site.
  { label: "Console", href: CONSOLE_URL },
  { label: "Docs", href: "/docs" },
  { label: "API", href: "/api" },
];
