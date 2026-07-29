/**
 * Landing copy, kept out of the components that render it.
 *
 * Every claim here describes something the product actually does. The
 * temptation on a page like this is to write what would sound good; the same
 * rule that governs the evidence model governs the marketing — a sentence
 * nobody could check is worse than a shorter page.
 */

export type SecurityPoint = {
  title: string;
  detail: string;
};

/** Properties a reader can verify, not reassurances. */
export const securityPoints: SecurityPoint[] = [
  {
    title: "Executions are private by default",
    detail:
      "Every run is scoped to the key that made it. Nothing appears publicly unless its owner explicitly publishes it, and publishing is reversible.",
  },
  {
    title: "Keys are stored as hashes",
    detail:
      "A key is shown once, on creation, and never again — there is no endpoint that can reveal one. A copy of the database yields no working credentials.",
  },
  {
    title: "Spend is capped, not monitored",
    detail:
      "Each key carries a daily execution allowance enforced in the database, so a limit holds across restarts and concurrent requests rather than being checked after the fact.",
  },
  {
    title: "Outbound requests are bounded",
    detail:
      "Private and loopback addresses are refused, every call carries a timeout, and a rejected request is never retried into a loop.",
  },
];

export type Capability = {
  title: string;
  detail: string;
};

/** What the platform can be asked to do, in the reader's terms. */
export const capabilities: Capability[] = [
  {
    title: "Check a claim against its source",
    detail:
      "A listed website, a stated owner, a reported volume — each is tested against something independent, and the disagreement is the finding.",
  },
  {
    title: "Read what is not published",
    detail:
      "An unverified contract still exposes what it can do. Molthood recovers that from what is deployed rather than reporting the gap and stopping.",
  },
  {
    title: "Screen everything at once",
    detail:
      "A wallet is not one subject but many. Every position is scored by the same rules a single analysis applies, worst first.",
  },
  {
    title: "Notice when something changes",
    detail:
      "A single analysis is a photograph. Watched subjects are re-checked on a schedule, and the report leads with what moved since last time.",
  },
];

export type FaqItem = {
  question: string;
  answer: string;
};

export const faq: FaqItem[] = [
  {
    question: "What does Molthood actually produce?",
    answer:
      "A report. It carries the findings, the source behind each one, the checks that could not be made and why, and a timeline of what ran. Every figure links to somewhere it can be checked without trusting us.",
  },
  {
    question: "What happens when a check fails?",
    answer:
      "It is reported as a gap, not as a pass. This is the single rule the whole system is built on: a lookup that could not run and a lookup that came back clean are different answers, and collapsing them is how a tool becomes dangerous.",
  },
  {
    question: "Is anything I run visible to other people?",
    answer:
      "No. Executions are scoped to the key that made them, and the public feed shows only what an owner has explicitly published. A run records the subject it was about, which is precisely why it is private by default.",
  },
  {
    question: "What if a data source is down?",
    answer:
      "The run continues without it and the report says which step did not happen. A missing source degrades coverage; it does not fail the execution or quietly shrink the report.",
  },
  {
    question: "Can I see how a result was reached?",
    answer:
      "Yes. Every report includes the full execution timeline — the phases that ran, how long each took, and the ones that were skipped along with the reason.",
  },
];
