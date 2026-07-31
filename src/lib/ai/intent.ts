/**
 * What the user is actually asking for, decided before the model sees it.
 *
 * The point is that nobody should have to pick a tool. A 42-character hex
 * string is an address; a 66-character one is a transaction; a github.com link
 * is a repository. None of that needs a language model to work out, and doing
 * it here means the routing is deterministic, instant, and identical every
 * time — three things a model-based classifier is not.
 *
 * What is deliberately *not* decided here: whether an address is a token, a
 * wallet or a contract. That cannot be known without looking it up, and
 * guessing from the shape would produce a wallet report for a token roughly
 * half the time. The intent says "this is an address"; the lookup says which.
 */

export type Intent =
  | "address"
  | "transaction"
  | "repository"
  | "social"
  | "website"
  | "project"
  | "chain"
  | "thread"
  | "artifact"
  | "molthood"
  | "general";

export type Detection = {
  intent: Intent;
  /** The thing being asked about, in the form a tool needs. */
  subject?: string;
  /** Shown in the timeline. Plain language, never a code. */
  label: string;
};

const ADDRESS = /\b0x[0-9a-fA-F]{40}\b/;
const TX_HASH = /\b0x[0-9a-fA-F]{64}\b/;
const URL = /\bhttps?:\/\/[^\s<>"']+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"']*)?/i;
const GITHUB = /(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+(?:\/[\w.-]+)?)/i;
const X_PROFILE =
  /(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/(@?[A-Za-z0-9_]{1,15})(?:\/)?(?:\?|$|\s)/i;
const HANDLE = /(?:^|\s)@([A-Za-z0-9_]{2,15})\b/;

/**
 * Words that mean "give me a file".
 *
 * Checked before the subject, because "export that analysis as a PDF" is a
 * packaging request that happens to mention an analysis — routing it as an
 * analysis re-runs work that already happened.
 */
const ARTIFACT =
  /\b(export|download|create|generate|make|write|build)\b[^.]{0,40}\b(pdf|docx|word|xlsx|excel|csv|pptx|powerpoint|deck|presentation|markdown|\.md|json|html|svg|mermaid|spreadsheet|whitepaper|report|document|file)\b|\b(landing\s*page|whitepaper|pitch\s*deck|content\s*calendar)\b/i;

/** Questions about Molthood itself, answered from the product's own docs. */
const MOLTHOOD =
  /\bmolthood\b|\b(this\s+(product|platform|app|site)|your\s+roadmap|the\s+roadmap)\b/i;

/** Words that mean "write me a thread", regardless of the subject. */
const THREAD = /\b(x\s*thread|twitter\s*thread|tweet\s*thread|write\s+a\s+thread)\b/i;

/** Questions about the network itself rather than something on it. */
const CHAIN =
  /\b(robinhood\s*chain|the\s+chain|block\s*height|gas\s*price|network\s*stats?|chain\s*(stats?|state|status))\b/i;

export function detectIntent(text: string): Detection {
  const message = text.trim();

  // Thread requests win over everything: "write an X thread about 0x…" is a
  // writing task that happens to mention an address, and routing it as an
  // address analysis answers a question nobody asked.
  if (THREAD.test(message)) {
    return { intent: "thread", label: "Recognised a thread request" };
  }

  if (ARTIFACT.test(message)) {
    return { intent: "artifact", label: "Recognised a file request" };
  }

  if (MOLTHOOD.test(message)) {
    return { intent: "molthood", label: "Searching Molthood's documentation" };
  }

  const tx = message.match(TX_HASH);
  if (tx) {
    return { intent: "transaction", subject: tx[0], label: "Recognised a transaction hash" };
  }

  const address = message.match(ADDRESS);
  if (address) {
    return { intent: "address", subject: address[0], label: "Recognised an address" };
  }

  const repo = message.match(GITHUB);
  if (repo) {
    return { intent: "repository", subject: repo[1], label: "Recognised a repository" };
  }

  const profile = message.match(X_PROFILE);
  if (profile) {
    return {
      intent: "social",
      subject: profile[1].replace(/^@/, ""),
      label: "Recognised a social account",
    };
  }

  const handle = message.match(HANDLE);
  if (handle) {
    return { intent: "social", subject: handle[1], label: "Recognised a social account" };
  }

  const url = message.match(URL);
  if (url) {
    // A bare domain only counts when the sentence is about it. "email me at
    // a.co" is not a research request, and neither is a version like `1.2.3`.
    const value = url[0];
    if (!/^\d+(\.\d+)+$/.test(value)) {
      return { intent: "website", subject: value, label: "Recognised a website" };
    }
  }

  if (CHAIN.test(message)) {
    return { intent: "chain", label: "Recognised a chain question" };
  }

  // Explicit research verbs only. "What is impermanent loss?" and "tell me
  // about slippage" are conceptual questions, and treating them as research
  // put a live-data confidence badge on an answer that never needed one — the
  // badge then said, correctly and uselessly, that no source was consulted.
  if (
    /\b(research|analy[sz]e|due\s+diligence|look\s+(this|it)\s+up)\b/i.test(message) ||
    /\bis\s+\S+\s+(legit|legitimate|a\s+scam|safe|trustworthy)\b/i.test(message)
  ) {
    return { intent: "project", label: "Recognised a research request" };
  }

  return { intent: "general", label: "Understood the request" };
}

/**
 * The most recent concrete subject in a conversation.
 *
 * This is what makes "compare it with BTC" work. Without it, a follow-up that
 * uses a pronoun loses the subject entirely and the model either asks what
 * "it" means or, worse, invents one.
 *
 * Read newest-first and stops at the first hit, so the subject follows the
 * conversation rather than sticking to whatever was mentioned first.
 */
export function lastSubject(
  messages: { role: string; content: string }[],
): { intent: Intent; subject: string } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") continue;

    const detection = detectIntent(message.content);
    if (detection.subject) {
      return { intent: detection.intent, subject: detection.subject };
    }
  }
  return null;
}

/** Whether a message leans on the conversation for its subject. */
const PRONOUN =
  /\b(it|its|it's|this|that|they|them|their|the\s+(token|wallet|contract|project|repo|site))\b/i;

/**
 * The intent to attribute a follow-up to.
 *
 * "So is it safe to hold overnight?" classifies as research on its own words,
 * but the conversation is still about an address — and it was the follow-up
 * actions that gave this away, offering "research competitors" after a token
 * analysis. When a message has no subject of its own and leans on a pronoun,
 * the earlier intent is the true one.
 */
export function effectiveIntent(
  detection: Detection,
  carried: { intent: Intent; subject: string } | null,
  message: string,
): Intent {
  if (detection.subject || !carried) return detection.intent;
  return PRONOUN.test(message) ? carried.intent : detection.intent;
}
