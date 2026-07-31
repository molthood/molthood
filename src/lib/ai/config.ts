/**
 * Molt AI provider configuration.
 *
 * Read on the server only. `AI_API_KEY` deliberately has no `NEXT_PUBLIC_`
 * prefix: anything with that prefix is inlined into the JavaScript bundle and
 * served to every visitor, which for a billed inference key means handing out
 * the ability to spend. The browser talks to `/api/ai/chat`; only that route
 * talks to the provider.
 */

export const AI_BASE_URL = process.env.AI_BASE_URL ?? "https://gorouter.app/v1";

export const AI_MODEL = process.env.AI_MODEL ?? "claude-opus-5-thinking";

export const AI_API_KEY = process.env.AI_API_KEY ?? "";

/**
 * A Molthood API key for the assistant's own tool calls.
 *
 * Optional, and its absence is a first-class state rather than a crash: an
 * analysis is metered, so without a key the tools report that they could not
 * run and the model says so. That is the honesty rule applied to a chat
 * surface — a check that could not run must never be presented as a check
 * that came back clean.
 */
export const MOLTHOOD_API_KEY = process.env.MOLTHOOD_API_KEY ?? "";

/** The backend the tools call. Same default as the console's client. */
export const MOLTHOOD_API_URL =
  process.env.MOLTHOOD_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000";

/** Whether the assistant can answer at all. Surfaced by `/api/ai/chat`. */
export function isConfigured(): boolean {
  return AI_API_KEY.length > 0;
}
