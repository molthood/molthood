/**
 * Naming what a source *did*, rather than which company it was.
 *
 * Vendor names are an implementation detail. They change, they mean nothing to
 * a reader, and a product that lists them turns every supplier switch into a
 * visible change. So the console shows the role — "chain explorer", "security
 * screening" — and keeps the vendor out of the interface.
 *
 * The one thing this does **not** remove is the link. A finding is only
 * trustworthy because it can be checked somewhere independent, so every source
 * keeps its URL; only the label is rewritten. Hiding the destination would
 * trade a real guarantee for a cosmetic one.
 */

/** Internal service name → what it contributes. */
const SERVICE_ROLES: Record<string, string> = {
  blockscout: "Chain explorer",
  robinhood_rpc: "Chain node",
  codex: "Market data",
  goplus: "Security screening",
  openchain: "Contract signatures",
  openrouter: "Summary generation",
  exa: "Source discovery",
  tavily: "Source discovery",
  firecrawl: "Page retrieval",
  jina: "Page retrieval",
  e2b: "Code execution",
  upstash_redis: "Caching",
  upstash_qstash: "Scheduling",
  posthog: "Product analytics",
};

/**
 * Phrases that identify a supplier inside a human-written source label.
 *
 * Ordered longest-first so "GoPlus token security" is rewritten before a
 * shorter match could take a bite out of it.
 */
const VENDOR_PHRASES: [RegExp, string][] = [
  [/blockscout (token|address|contract) (page|api)/gi, "Chain explorer"],
  [/blockscout (stats )?api/gi, "Chain explorer"],
  [/blockscout explorer/gi, "Chain explorer"],
  [/blockscout/gi, "Chain explorer"],
  [/goplus token security/gi, "Security screening"],
  [/goplus/gi, "Security screening"],
  [/codex market data/gi, "Market data"],
  [/codex/gi, "Market data"],
  [/openrouter/gi, "Summary generation"],
  [/openchain/gi, "Contract signatures"],
  [/\bexa\b/gi, "Source discovery"],
  [/\btavily\b/gi, "Source discovery"],
  [/firecrawl/gi, "Page retrieval"],
  [/jina( reader)?/gi, "Page retrieval"],
  [/\be2b\b/gi, "Code execution"],
];

/** The roles that contributed to a run, deduplicated and readable. */
export function describeServices(services: string[]): string {
  const roles = services.map((name) => SERVICE_ROLES[name] ?? "Data source");
  return [...new Set(roles)].join(" · ") || "—";
}

/**
 * A source label with the supplier removed.
 *
 * The chain node is deliberately left alone: "RPC" names a protocol, not a
 * company, and calling it something vaguer would lose real meaning.
 */
export function describeSource(label: string): string {
  let result = label;
  for (const [pattern, role] of VENDOR_PHRASES) {
    result = result.replace(pattern, role);
  }
  // Collapse anything the substitutions doubled up, e.g. "Chain explorer
  // Chain explorer API".
  return result.replace(/\b(\w[\w\s]*?)\s+\1\b/gi, "$1").trim();
}

/**
 * A capability provider, named by what it does.
 *
 * Same rule as the service map above. The one place a vendor name survives is
 * the environment variable — `EXA_API_KEY` is what an operator has to type, so
 * blanking it would make the configuration page unable to do its job.
 */
const PROVIDER_ROLES: Record<string, string> = {
  exa: "Semantic search",
  tavily: "News and web search",
  jina: "Page reader",
  firecrawl: "Rendered page retrieval",
  e2b: "Code sandbox",
  upstash_redis: "Shared cache",
  upstash_qstash: "Scheduled delivery",
  posthog: "Product analytics",
  openrouter: "Summary generation",
};

export function describeProvider(name: string | null | undefined): string {
  if (!name) return "—";
  return PROVIDER_ROLES[name] ?? SERVICE_ROLES[name] ?? "Data source";
}

/** Several providers, deduplicated by role. */
export function describeProviders(names: string[]): string {
  const roles = names.map(describeProvider);
  return [...new Set(roles)].join(" · ") || "—";
}
