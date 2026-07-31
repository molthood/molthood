/**
 * Structured output derived from tool results — cards, confidence, actions.
 *
 * **Everything here is computed from data the tools returned, never parsed out
 * of the model's prose.** That is the whole point: a card showing a liquidity
 * figure the model wrote is a card that can be wrong in a way the reader has
 * no way to detect, because it looks exactly like a card showing a figure that
 * was measured. The prose sits beside these, not behind them.
 */

import type { Intent } from "@/lib/ai/intent";
import type { SourceRef, ToolResult } from "@/lib/ai/tools";

export type CardField = {
  label: string;
  value: string;
  /** Renders in the accent colour — one per card at most. */
  emphasis?: boolean;
  /** Flags a value that reads as a risk rather than a fact. */
  tone?: "warn";
};

export type AnalysisCard = {
  id: string;
  title: string;
  /** A short line under the title, when the numbers need framing. */
  note?: string;
  fields: CardField[];
};

export type Confidence = {
  level: "high" | "medium" | "low" | "none";
  /** Why it is that level. Never omitted — a bare badge explains nothing. */
  reason: string;
};

export type SuggestedAction = { label: string; prompt: string };

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

function money(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  // Sub-dollar tokens are the common case here and rounding them to two
  // decimals turns every one of them into $0.00.
  return `$${n.toPrecision(3)}`;
}

function count(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString("en-US");
}

function pick(source: unknown, ...path: string[]): unknown {
  let current = source;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function field(label: string, value: string | null, extra?: Partial<CardField>): CardField | null {
  return value === null ? null : { label, value, ...extra };
}

function compact(fields: (CardField | null)[]): CardField[] {
  return fields.filter((entry): entry is CardField => entry !== null);
}

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

function analysisCards(data: unknown): AnalysisCard[] {
  const facts = pick(data, "facts");
  const target = String(pick(data, "target") ?? "");
  const cards: AnalysisCard[] = [];

  const token = pick(facts, "token");
  const market = pick(facts, "market") ?? token;
  const risk = pick(facts, "risk");

  if (token && typeof token === "object") {
    const identity = compact([
      field("Name", (pick(token, "name") as string) ?? null),
      field("Symbol", (pick(token, "symbol") as string) ?? null),
      field("Holders", count(pick(token, "holders") ?? pick(token, "holders_count"))),
      field("Total supply", count(pick(token, "total_supply"))),
    ]);
    if (identity.length) cards.push({ id: "identity", title: "Token", fields: identity });
  }

  if (market && typeof market === "object") {
    const liquidity = money(pick(market, "liquidity_usd"));
    const volume = money(pick(market, "volume_24h_usd"));
    const marketCap = money(pick(market, "market_cap_usd"));

    const fields = compact([
      field("Price", money(pick(market, "price_usd"))),
      field("Market cap", marketCap),
      field("24h volume", volume),
      field("Liquidity", liquidity, { emphasis: true }),
      field("Pools", count(pick(market, "pool_count"))),
    ]);

    if (fields.length) {
      cards.push({
        id: "market",
        title: "Market",
        // Liquidity is what decides whether a position can be exited; market
        // cap is a price multiplied by a supply nobody is selling.
        note: liquidity ? "Liquidity, not market cap, is what you can exit into." : undefined,
        fields,
      });
    }
  }

  if (risk && typeof risk === "object") {
    const score = pick(risk, "score");
    const signals = pick(risk, "signals");
    const high = Array.isArray(signals)
      ? signals.filter((s) => String(pick(s, "severity") ?? "").toLowerCase() === "high")
      : [];

    const fields = compact([
      field("Score", score === undefined ? null : `${score}/100`, { emphasis: true }),
      field("Signals", count(Array.isArray(signals) ? signals.length : undefined)),
      field(
        "High severity",
        high.length ? String(high.length) : null,
        { tone: "warn" },
      ),
    ]);

    for (const signal of high.slice(0, 4)) {
      const label = String(pick(signal, "label") ?? pick(signal, "id") ?? "");
      if (label) fields.push({ label, value: "Present", tone: "warn" });
    }

    if (fields.length) {
      cards.push({
        id: "risk",
        title: "Risk",
        note: "Higher is safer. A score is a ceiling when a check could not run.",
        fields,
      });
    }
  }

  // Anything the run could not establish, stated rather than omitted.
  const stages = pick(data, "stages");
  if (Array.isArray(stages)) {
    const failed = stages.filter((stage) =>
      ["skipped", "failed"].includes(String(pick(stage, "status") ?? "")),
    );
    if (failed.length) {
      cards.push({
        id: "gaps",
        title: "Could not check",
        note: "These are unknowns, not clean results.",
        fields: failed.slice(0, 5).map((stage) => ({
          label: String(pick(stage, "name") ?? "Step"),
          value: String(pick(stage, "error") ?? "Did not run"),
          tone: "warn" as const,
        })),
      });
    }
  }

  if (cards.length === 0 && target) {
    const status = pick(data, "status");
    if (status) {
      cards.push({
        id: "run",
        title: "Analysis",
        fields: [{ label: "Status", value: String(status) }],
      });
    }
  }

  return cards;
}

function transactionCards(data: unknown): AnalysisCard[] {
  if (pick(data, "found") === false) return [];

  const status = String(pick(data, "status") ?? "");
  const gasUsed = Number(pick(data, "gas_used"));
  const gasLimit = Number(pick(data, "gas_limit"));

  return [
    {
      id: "transaction",
      title: "Transaction",
      fields: compact([
        field(
          "Outcome",
          status ? (status === "success" ? "Succeeded" : "Reverted") : null,
          { emphasis: true, ...(status === "reverted" ? { tone: "warn" as const } : {}) },
        ),
        field("Block", count(pick(data, "block_number"))),
        field("From", shorten(pick(data, "from"))),
        field(
          "To",
          pick(data, "creates_contract") ? "Contract deployment" : shorten(pick(data, "to")),
        ),
        field("Value", wei(pick(data, "value_wei"))),
        field(
          "Gas used",
          Number.isFinite(gasUsed) && Number.isFinite(gasLimit) && gasLimit > 0
            ? `${count(gasUsed)} of ${count(gasLimit)}`
            : count(pick(data, "gas_used")),
        ),
        field("Events", count(pick(data, "log_count"))),
      ]),
    },
  ];
}

function repositoryCards(data: unknown): AnalysisCard[] {
  if (pick(data, "kind") !== "repository") return [];

  const pushed = pick(data, "pushed_at");
  return [
    {
      id: "repository",
      title: "Repository",
      // Activity outranks popularity: a starred repository nobody has touched
      // in two years is a different proposition from its star count.
      note: "Last activity says more than star count.",
      fields: compact([
        field("Stars", count(pick(data, "stars"))),
        field("Forks", count(pick(data, "forks"))),
        field("Open issues", count(pick(data, "open_issues"))),
        field("Language", (pick(data, "language") as string) ?? null),
        field("Licence", (pick(data, "license") as string) ?? "None declared"),
        field("Last push", age(pushed), { emphasis: true }),
        pick(data, "archived") ? { label: "Archived", value: "Yes", tone: "warn" as const } : null,
        pick(data, "is_fork") ? { label: "Fork", value: "Yes" } : null,
      ]),
    },
  ];
}

function chainCards(data: unknown): AnalysisCard[] {
  const fields = compact([
    field("Head block", count(pick(data, "head_block") ?? pick(data, "block_height"))),
    field("Total transactions", count(pick(data, "total_transactions"))),
    field("Addresses", count(pick(data, "total_addresses"))),
    field("Gas price", gwei(pick(data, "gas_price") ?? pick(data, "average_gas_price"))),
  ]);
  return fields.length ? [{ id: "chain", title: "Robinhood Chain", fields }] : [];
}

function shorten(value: unknown): string | null {
  const text = typeof value === "string" ? value : null;
  if (!text) return null;
  return text.length > 14 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text;
}

function wei(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return "0";
  const eth = n / 1e18;
  return eth >= 0.0001 ? `${eth.toFixed(4)}` : `${n.toLocaleString("en-US")} wei`;
}

function gwei(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${n} gwei`;
}

function age(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const then = Date.parse(value);
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

/** Cards for whatever a tool returned, chosen by which tool it was. */
export function cardsFor(tool: string, result: ToolResult): AnalysisCard[] {
  if (!result.available || result.data === undefined) return [];

  switch (tool) {
    case "analyse_subject":
      return analysisCards(result.data);
    case "explain_transaction":
      return transactionCards(result.data);
    case "inspect_repository":
      return repositoryCards(result.data);
    case "chain_overview":
      return chainCards(result.data);
    default:
      return [];
  }
}

/* ------------------------------------------------------------------ */
/* Confidence                                                          */
/* ------------------------------------------------------------------ */

/**
 * How much of the answer rests on something that was actually checked.
 *
 * `none` rather than `low` when no tool ran on a question that needed one.
 * "Low confidence" describes a weak answer; this is the absence of one, and
 * the two should not share a word.
 */
export function confidenceFor(
  intent: Intent,
  outcomes: { ok: number; failed: number },
): Confidence | null {
  const needsData = !["general", "thread"].includes(intent);
  const total = outcomes.ok + outcomes.failed;

  if (!needsData) return null;

  if (total === 0) {
    return {
      level: "none",
      reason: "No live source was consulted. This is general knowledge, not a check.",
    };
  }
  if (outcomes.ok === 0) {
    return {
      level: "none",
      reason: `Every check failed (${outcomes.failed}). Nothing about this subject was established.`,
    };
  }
  if (outcomes.failed === 0) {
    return {
      level: "high",
      reason: `All ${outcomes.ok} checks completed against live sources.`,
    };
  }
  return {
    level: "medium",
    reason: `${outcomes.ok} of ${total} checks completed. The rest are unknowns, not clean results.`,
  };
}

/* ------------------------------------------------------------------ */
/* Suggested actions                                                   */
/* ------------------------------------------------------------------ */

/**
 * What to ask next, derived from the intent rather than generated.
 *
 * Deterministic on purpose: these appear the instant an answer finishes, cost
 * nothing, and cannot suggest an action the platform has no way to perform.
 */
export function actionsFor(intent: Intent, subject?: string): SuggestedAction[] {
  const it = subject ?? "it";

  switch (intent) {
    case "address":
      return [
        { label: "Analyse the holders", prompt: `Who holds ${it}, and how concentrated is it?` },
        { label: "Explain the risks", prompt: `What are the specific risks of ${it}, ranked?` },
        { label: "Compare another token", prompt: `Compare ${it} with ` },
        { label: "Generate X thread", prompt: `Write an X thread explaining what you found about ${it}.` },
        { label: "Export PDF", prompt: `Export that analysis of ${it} as a PDF.` },
        { label: "Export DOCX", prompt: `Export that analysis of ${it} as a DOCX report.` },
      ];
    case "transaction":
      return [
        { label: "Explain the sender", prompt: `Analyse the wallet that sent ${it}.` },
        { label: "Explain the contract", prompt: `Explain the contract this transaction called.` },
        { label: "Was this normal?", prompt: `Was ${it} a normal transaction for this kind of contract?` },
      ];
    case "repository":
      return [
        { label: "Is it maintained?", prompt: `Judge how actively maintained ${it} is, and on what evidence.` },
        { label: "Research the project", prompt: `Research the project behind ${it}.` },
        { label: "Compare alternatives", prompt: `What are the main alternatives to ${it}?` },
        { label: "Generate docs", prompt: `Write documentation for ${it} as a markdown file.` },
      ];
    case "website":
    case "project":
      return [
        { label: "What is unverifiable?", prompt: `What claims about ${it} could not be verified?` },
        { label: "Research competitors", prompt: `Who competes with ${it}, and how do they differ?` },
        { label: "Audit the landing page", prompt: `Audit the landing page of ${it}: clarity, claims, and what is missing.` },
        { label: "Research the GitHub", prompt: `Find and analyse the GitHub repository behind ${it}.` },
        { label: "Find the token", prompt: `Does ${it} have a token on Robinhood Chain?` },
        { label: "Generate X thread", prompt: `Write an X thread about ${it} based on what you found.` },
        { label: "Export PDF", prompt: `Export that research on ${it} as a PDF.` },
      ];
    case "social":
      return [
        { label: "Research the project", prompt: `Research the project behind ${it}.` },
        { label: "Find the site", prompt: `Find and analyse the official website for ${it}.` },
      ];
    case "artifact":
      return [
        { label: "Regenerate shorter", prompt: "Regenerate that file, half the length." },
        { label: "Export as PDF", prompt: "Export that as a PDF instead." },
        { label: "Export as DOCX", prompt: "Export that as a DOCX instead." },
      ];
    case "molthood":
      return [
        { label: "What is shipped?", prompt: "What is actually built and usable in Molthood today?" },
        { label: "What is next?", prompt: "What is Molthood building next, and why?" },
        { label: "How does it work?", prompt: "How does a Molthood analysis actually work, step by step?" },
      ];
    case "chain":
      return [
        { label: "Most active tokens", prompt: "What are the most active tokens on Robinhood Chain?" },
        { label: "How does it compare?", prompt: "How does Robinhood Chain compare to other EVM networks?" },
      ];
    case "thread":
      return [
        { label: "Make it shorter", prompt: "Make that thread half the length, same substance." },
        { label: "More technical", prompt: "Rewrite that thread for a technical audience." },
      ];
    default:
      return [];
  }
}

/** Merges source lists, keeping the first URL seen for each role. */
export function mergeSources(lists: (SourceRef[] | undefined)[]): SourceRef[] {
  const merged = new Map<string, SourceRef>();
  for (const list of lists) {
    for (const source of list ?? []) {
      const existing = merged.get(source.role);
      if (!existing) merged.set(source.role, source);
      else if (!existing.url && source.url) merged.set(source.role, source);
    }
  }
  return [...merged.values()];
}
