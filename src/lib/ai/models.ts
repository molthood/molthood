/**
 * The model catalogue behind Molthood Agent's selector.
 *
 * GoRouter exposes `GET /v1/models`, so the list is fetched rather than
 * written down — a model added upstream appears in the selector without a
 * deploy. What the endpoint returns is only `id`, `owned_by` and which
 * endpoint styles it speaks: no context window, no pricing, no latency.
 *
 * That shortage is why the badges below are declared as **editorial labels**
 * rather than derived from a measurement. Printing "Long Context" next to a
 * number the provider never sent would be exactly the invented-placeholder
 * failure the rest of this codebase is built to avoid. These say how we
 * position a model, and the code says so out loud instead of implying it
 * measured something.
 */

export type ModelBadge =
  | "Fast"
  | "Best Reasoning"
  | "Coding"
  | "Long Context"
  | "Premium";

export type ModelOption = {
  id: string;
  label: string;
  /** One line under the name in the picker. */
  description: string;
  badges: ModelBadge[];
};

/** Every model this deployment is willing to send a request to. */
export const DEFAULT_MODEL_IDS = [
  "claude-opus-5-thinking",
  "claude-opus-5",
  "claude-opus-4-8-thinking",
  "claude-opus-4-8",
];

/**
 * Editorial positioning, keyed by model id.
 *
 * A `-thinking` variant spends tokens on reasoning before answering, so it
 * gets "Best Reasoning" and never "Fast" — the two are a trade, and a picker
 * that claimed both would be telling people nothing.
 */
const CURATED: Record<string, { description: string; badges: ModelBadge[] }> = {
  "claude-opus-5-thinking": {
    description: "Reasons before answering. Best for analysis and hard questions.",
    badges: ["Best Reasoning", "Long Context", "Premium"],
  },
  "claude-opus-5": {
    description: "Answers immediately. Best for writing, code and quick turns.",
    badges: ["Fast", "Coding", "Long Context", "Premium"],
  },
  "claude-opus-4-8-thinking": {
    description: "The previous generation, reasoning first.",
    badges: ["Best Reasoning", "Long Context"],
  },
  "claude-opus-4-8": {
    description: "The previous generation, answering directly.",
    badges: ["Fast", "Coding", "Long Context"],
  },
};

/** `claude-opus-5-thinking` → `Opus 5 Thinking`. */
function titleFrom(id: string): string {
  return id
    .split(/[-_]/)
    .filter((part) => part !== "claude")
    .map((part) =>
      /^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ")
    .replace(/(\d) (\d)/g, "$1.$2");
}

/**
 * Badges for a model nobody curated.
 *
 * Deliberately thin. An unknown id supports exactly one honest inference —
 * whether it reasons first — and guessing the rest from a name would put a
 * "Coding" badge on something nobody has run.
 */
function inferBadges(id: string): ModelBadge[] {
  return id.includes("thinking") ? ["Best Reasoning"] : ["Fast"];
}

export function describeModel(id: string): ModelOption {
  const curated = CURATED[id];
  return {
    id,
    label: titleFrom(id),
    description: curated?.description ?? "Available through the same provider.",
    badges: curated?.badges ?? inferBadges(id),
  };
}

/**
 * The allow-list, from `AI_MODELS` when set.
 *
 * Comma-separated ids. Used both as the fallback when the provider's catalogue
 * cannot be reached and as a filter over it, so an operator can narrow what a
 * public deployment is willing to spend on.
 */
export function configuredModelIds(): string[] | null {
  const raw = process.env.AI_MODELS?.trim();
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : null;
}
