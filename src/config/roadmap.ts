/**
 * The roadmap, as data.
 *
 * One source. The documentation page renders it, and every "coming soon" card
 * in the developer platform reads its phase from here — so a feature cannot be
 * "Next" on one page and "Planned" on another, which is what happened when the
 * two were written separately.
 *
 * **Nothing here is a date.** A date given at this stage is a promise made with
 * the least information anyone will ever have about the work. Phases say order,
 * which is the part that is actually known.
 */

export type RoadmapPhase = "Shipped" | "Current" | "Next" | "Planned" | "Future";

export const PHASE_ORDER: RoadmapPhase[] = [
  "Shipped",
  "Current",
  "Next",
  "Planned",
  "Future",
];

export const PHASE_BLURB: Record<RoadmapPhase, string> = {
  Shipped: "Available now. Everything below this line is not.",
  Current: "Being built. Partly usable, and honest about which parts.",
  Next: "Starts when the current work lands. Shape is decided.",
  Planned: "Committed, not started. Shape is roughly known.",
  Future: "Wanted, not committed. Listed so the direction is legible.",
};

export type RoadmapItem = {
  id: string;
  title: string;
  phase: RoadmapPhase;
  /** What the thing is. */
  description: string;
  /** Why it is worth building — the part most roadmaps omit. */
  why: string;
};

export const roadmap: RoadmapItem[] = [
  // ── Shipped ───────────────────────────────────────────────────────────
  {
    id: "analysis-engine",
    title: "Analysis engine",
    phase: "Shipped",
    description:
      "Token, wallet, contract and website analysis against live Robinhood Chain data, with every finding carrying the source it came from.",
    why: "A score with no evidence behind it is an opinion. Every number here can be checked at its source, and a check that could not run is reported as unknown rather than passed.",
  },
  {
    id: "console",
    title: "Console",
    phase: "Shipped",
    description:
      "Run an analysis, watch it stream, read the report, compare two subjects, and keep a history scoped to your key.",
    why: "The evidence is complete about a third of the way into a run. Streaming means you read the findings while the summary is still being written instead of waiting for both.",
  },
  {
    id: "molthood-agent",
    title: "Molthood Agent",
    phase: "Shipped",
    description:
      "A conversational surface that reaches the same analysis engine and answers in plain language, with a model selector and full conversation history.",
    why: "Most questions are not a form. Asking one in a sentence is faster than choosing a subject type, and the Agent decides for itself when live data is needed.",
  },
  {
    id: "change-detection",
    title: "Change detection",
    phase: "Shipped",
    description:
      "Re-run a subject and receive what changed rather than a second full report.",
    why: "A single analysis is a photograph. Risk moves — liquidity drains, ownership transfers — and the difference between two runs is the part worth reading.",
  },

  // ── Current ───────────────────────────────────────────────────────────
  {
    id: "public-api",
    title: "Public API",
    phase: "Current",
    description:
      "The same engine the console uses, over plain HTTP and JSON, with a documented response contract.",
    why: "An analysis platform you cannot call from your own code is a website. The reference is written and the routes exist; what remains is the stability guarantee.",
  },
  {
    id: "api-keys",
    title: "API keys",
    phase: "Current",
    description:
      "Scoped credentials with per-key allowances, rotation, revocation and an audit trail.",
    why: "Analyses cost real inference credit, so they have to be metered against something. Per-key limits also mean one integration cannot spend another's budget.",
  },

  // ── Next ──────────────────────────────────────────────────────────────
  {
    id: "webhooks",
    title: "Webhooks",
    phase: "Next",
    description:
      "Delivery of execution and change events to an endpoint you control, with signing and retries.",
    why: "Polling for a result that takes a minute wastes both sides. A monitored subject that changes at 3am should reach your system without anyone watching a screen.",
  },
  {
    id: "notifications",
    title: "Notifications",
    phase: "Next",
    description:
      "In-product and email alerts for watched subjects, scoped to what actually changed.",
    why: "A watch is only useful if it can reach you. The diff already exists; this is the delivery half of it.",
  },
  {
    id: "sdk",
    title: "SDK",
    phase: "Next",
    description: "Typed clients for TypeScript, Python and Go.",
    why: "Types that match the response contract mean a field that moves breaks at compile time rather than in production at the worst possible moment.",
  },

  // ── Planned ───────────────────────────────────────────────────────────
  {
    id: "cli",
    title: "CLI",
    phase: "Planned",
    description:
      "Drive executions, stream them, and pull artifacts from a terminal.",
    why: "Scripting an analysis into a build step or a cron job should not require writing an HTTP client first.",
  },
  {
    id: "mcp",
    title: "MCP support",
    phase: "Planned",
    description:
      "A Model Context Protocol server exposing Molthood's analyses as tools any compatible AI client can call.",
    why: "Your assistant should be able to perform the analysis and read the evidence, rather than describe what it would check if it could.",
  },
  {
    id: "skills",
    title: "Skills",
    phase: "Planned",
    description:
      "Named, versioned workflows: package a sequence you run often, install one somebody else built.",
    why: "Most analysis is repetition with the subject swapped. A skill makes that repetition shareable instead of rebuilt each time.",
  },
  {
    id: "portfolio",
    title: "Portfolio",
    phase: "Planned",
    description:
      "Every holding in a wallet screened by the same rules a single token gets, with the weakest positions surfaced first.",
    why: "Risk concentrates in the holding nobody checked. A portfolio score is a ceiling when a check could not run — never a clean bill of health by omission.",
  },
  {
    id: "smart-alerts",
    title: "Smart alerts",
    phase: "Planned",
    description:
      "Conditional monitoring: tell it what would matter, and hear only about that.",
    why: "An hourly report about a token that has not moved is noise you learn to ignore, which defeats the point of watching at all.",
  },

  // ── Future ────────────────────────────────────────────────────────────
  {
    id: "wallet-intelligence",
    title: "Wallet intelligence",
    phase: "Future",
    description:
      "Behavioural profiling of an address: what it does, how it has behaved over time, and how it relates to others.",
    why: "A balance says what an address holds. What it has repeatedly done says considerably more about what it is.",
  },
  {
    id: "agent-marketplace",
    title: "Agent marketplace",
    phase: "Future",
    description:
      "Publish and install specialist agents built by other people, versioned and reviewable.",
    why: "The set of useful checks is larger than one team can write. The engine is already agent-shaped; the gap is distribution.",
  },
  {
    id: "strategy-builder",
    title: "Strategy builder",
    phase: "Future",
    description:
      "Compose conditions and analyses into a saved, re-runnable strategy without writing code.",
    why: "The people with the best sense of what to check are frequently not the people who want to write a client for it.",
  },
  {
    id: "mobile-app",
    title: "Mobile app",
    phase: "Future",
    description: "Native iOS and Android clients for alerts and quick checks.",
    why: "Checking a contract before signing is something you do standing up, on a phone, with a wallet already open.",
  },
  {
    id: "browser-extension",
    title: "Browser extension",
    phase: "Future",
    description:
      "Inline risk context on the pages where a token address actually appears.",
    why: "The decision happens on the swap screen, not in a separate tab. Evidence that arrives after the decision is history, not risk analysis.",
  },
];

export function itemsInPhase(phase: RoadmapPhase): RoadmapItem[] {
  return roadmap.filter((item) => item.phase === phase);
}

export function phaseOf(id: string): RoadmapPhase | undefined {
  return roadmap.find((item) => item.id === id)?.phase;
}
