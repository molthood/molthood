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
export function phaseLabel(intent: Intent, phase: "reasoning" | "tools" | "writing"): string {
  if (phase === "tools") {
    switch (intent) {
      case "address":
        return "Inspecting the contract…";
      case "website":
      case "project":
        return "Reading documentation…";
      case "repository":
        return "Reading the repository…";
      case "transaction":
        return "Reading the transaction…";
      case "chain":
        return "Comparing market data…";
      case "molthood":
        return "Reading Molthood's documentation…";
      case "artifact":
        return "Assembling the file…";
      default:
        return "Gathering evidence…";
    }
  }
  if (phase === "writing") {
    return intent === "artifact" ? "Preparing the file…" : "Writing the answer…";
  }
  return "Thinking…";
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
