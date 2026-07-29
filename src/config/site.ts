export const siteConfig = {
  name: "Molthood",
  tagline: "AI Execution Agents for Robinhood Chain.",
  description:
    "Molthood is an AI execution platform built exclusively for Robinhood Chain. One request, multiple agents, zero manual work.",
  url: "https://molthood.org",
  chain: "Robinhood Chain",
  links: {
    console: "/console",
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
  { label: "Console", href: "/console" },
  { label: "Docs", href: "/docs" },
  { label: "API", href: "/api" },
];

/** Footer links — intentionally the same surface area as the header. */
export const footerNav: NavItem[] = [
  { label: "Console", href: "/console" },
  { label: "Docs", href: "/docs" },
  { label: "API", href: "/api" },
];
