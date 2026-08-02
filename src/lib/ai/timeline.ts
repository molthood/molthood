/**
 * What the agent is doing, planned ahead and then corrected by what happened.
 *
 * Two halves, and the split is the whole honesty argument.
 *
 * **The plan** is written from the detected intent and shown immediately as
 * pending steps. A wallet question and a repository question get different
 * lists, because they genuinely do different work — nobody should watch
 * "Building the response" for forty seconds and learn nothing.
 *
 * **The record** replaces it. The analysis engine reports the tasks it
 * actually ran and the stages they passed through, so once the tool returns,
 * the invented labels are thrown away and the real ones take their place. A
 * step that never happened is never ticked, and a step that failed keeps
 * saying so.
 *
 * The temptation here is to animate six plausible checkmarks and call it a
 * timeline. That is theatre, and it is the same lie as an unrun check rendered
 * clean — just prettier.
 */

import type { Intent } from "@/lib/ai/intent";

export type PlannedStep = { id: string; label: string };

/** What a given kind of question is expected to involve. */
const PLANS: Record<Intent, PlannedStep[]> = {
  address: [
    { id: "detect", label: "Identifying the address" },
    { id: "market", label: "Reading market and holders" },
    { id: "security", label: "Running security checks" },
    { id: "compose", label: "Building the conclusion" },
  ],
  transaction: [
    { id: "detect", label: "Detecting the transaction" },
    { id: "receipt", label: "Reading the transaction and its receipt" },
    { id: "compose", label: "Explaining what happened" },
  ],
  repository: [
    { id: "detect", label: "Detecting the repository" },
    { id: "repo", label: "Reading activity and licence" },
    { id: "compose", label: "Judging how maintained it is" },
  ],
  website: [
    { id: "detect", label: "Detecting the website" },
    { id: "crawl", label: "Reading published pages" },
    { id: "records", label: "Checking domain records" },
    { id: "compose", label: "Writing the report" },
  ],
  project: [
    { id: "detect", label: "Identifying the subject" },
    { id: "research", label: "Gathering what is published" },
    { id: "compose", label: "Writing the report" },
  ],
  social: [
    { id: "detect", label: "Detecting the account" },
    { id: "compose", label: "Reporting what can be checked" },
  ],
  chain: [
    { id: "detect", label: "Reading chain statistics" },
    { id: "compose", label: "Summarising the network" },
  ],
  thread: [
    { id: "detect", label: "Planning the thread" },
    { id: "compose", label: "Writing the posts" },
  ],
  artifact: [
    { id: "detect", label: "Planning the file" },
    { id: "content", label: "Writing the content" },
    { id: "package", label: "Formatting and packaging" },
  ],
  molthood: [
    { id: "detect", label: "Searching Molthood's documentation" },
    { id: "read", label: "Reading the relevant pages" },
    { id: "compose", label: "Answering from project knowledge" },
  ],
  general: [{ id: "detect", label: "Understanding the request" }],
};

export function planFor(intent: Intent): PlannedStep[] {
  return PLANS[intent] ?? PLANS.general;
}

/**
 * The live status line under the answer, by phase.
 *
 * Replaces a permanent "Thinking…". It says which part is slow, which is the
 * only thing a reader waiting on a long run actually wants to know.
 */
/**
 * The live status line, as a sequence rather than a single label.
 *
 * Each phase of each kind of question has its own list, and the client walks
 * it while that phase lasts. So a wallet question reads *Detecting wallet →
 * Reading balances → Reading transfers*, and a file request reads *Planning
 * the document → Writing content → Formatting*, and neither is ever the
 * sequence the other one shows.
 *
 * Every line here describes work the request genuinely involves — this is a
 * status line, not a progress bar, and it makes no claim about how far along
 * anything is. What it must never do is narrate a step that could not happen
 * for this kind of question at all.
 */
const PHASES: Record<Intent, { tools: string[]; writing: string[] }> = {
  address: {
    tools: [
      "Detecting the subject…",
      "Reading market data…",
      "Checking liquidity…",
      "Scanning holders…",
      "Running security checks…",
    ],
    writing: ["Building the summary…", "Weighing the signals…", "Finalising…"],
  },
  transaction: {
    tools: ["Locating the transaction…", "Reading the receipt…", "Decoding the call…"],
    writing: ["Explaining what happened…", "Finalising…"],
  },
  repository: {
    tools: ["Reading the project…", "Checking activity…", "Reviewing the licence…"],
    writing: ["Judging maintenance…", "Preparing the answer…"],
  },
  website: {
    tools: [
      "Reading the website…",
      "Analysing pages…",
      "Understanding the documentation…",
      "Checking domain records…",
    ],
    writing: ["Generating insights…", "Writing the report…"],
  },
  project: {
    tools: ["Gathering published sources…", "Cross-checking claims…"],
    writing: ["Writing the report…", "Finalising…"],
  },
  social: {
    tools: ["Checking what is reachable…"],
    writing: ["Preparing the answer…"],
  },
  chain: {
    tools: ["Reading chain state…", "Comparing market data…"],
    writing: ["Summarising the network…"],
  },
  thread: {
    tools: ["Gathering the facts…"],
    writing: ["Drafting the posts…", "Tightening each line…"],
  },
  artifact: {
    tools: ["Gathering the material…"],
    writing: [
      "Planning the document…",
      "Writing content…",
      "Formatting…",
      "Packaging the file…",
    ],
  },
  molthood: {
    tools: ["Searching Molthood's documentation…", "Reading the relevant pages…"],
    writing: ["Answering from project knowledge…"],
  },
  general: {
    tools: ["Gathering context…"],
    writing: ["Preparing the answer…", "Finalising…"],
  },
};

/** The whole sequence for a phase, which the client cycles through. */
export function phaseSteps(intent: Intent, phase: "reasoning" | "tools" | "writing"): string[] {
  if (phase === "reasoning") return ["Thinking…", "Working through it…"];
  const entry = PHASES[intent] ?? PHASES.general;
  return phase === "tools" ? entry.tools : entry.writing;
}

/** Engine task names, in the words a reader would use. */
const TASK_LABELS: Record<string, string> = {
  market_analysis: "Read market, liquidity and holders",
  risk_analysis: "Ran security checks",
  chain_analysis: "Read chain state",
  site_analysis: "Read the published site",
  wallet_analysis: "Read balances and transfers",
  contract_analysis: "Read the contract",
  portfolio_analysis: "Screened every holding",
  research: "Gathered published sources",
};

function humanise(name: string): string {
  return (
    TASK_LABELS[name] ??
    name.replace(/_/g, " ").replace(/^\w/, (character) => character.toUpperCase())
  );
}

export type RecordedStep = {
  id: string;
  label: string;
  status: "ok" | "unavailable";
  reason?: string;
};

/**
 * The steps an analysis actually took, from its own report.
 *
 * Reads `tasks` rather than `stages`: a stage is a phase of the pipeline
 * ("engine", "evidence"), and a task is a thing that was done. The second is
 * what a reader recognises.
 */
export function recordedSteps(data: unknown): RecordedStep[] {
  if (typeof data !== "object" || data === null) return [];
  const tasks = (data as { tasks?: unknown }).tasks;
  if (!Array.isArray(tasks)) return [];

  return tasks
    .filter((task): task is Record<string, unknown> => typeof task === "object" && task !== null)
    .map((task) => {
      const status = String(task.status ?? "");
      return {
        id: String(task.id ?? task.name ?? "task"),
        label: humanise(String(task.name ?? "step")),
        // Only `completed` earns a tick. Skipped and failed both stay visible
        // as things that did not happen, which is the entire point of showing
        // the list rather than a spinner.
        status: status === "completed" ? ("ok" as const) : ("unavailable" as const),
        reason: status === "skipped" ? "not_found" : status ? undefined : undefined,
      };
    });
}
