/**
 * The model catalogue behind Molthood Agent's selector.
 *
 * Four models, curated. One entry per model rather than one per generation:
 * a picker offering Opus 5 and Opus 4.8 side by side asks people to make a
 * decision they have no basis for, and the older one is never the right answer.
 *
 * Availability is checked against the provider rather than assumed. A model
 * this deployment's key cannot reach is shown and disabled, not hidden — a
 * missing entry looks like a model that was never offered, and the difference
 * matters to whoever has to enable it.
 */

export type ModelBadge =
  | "Fast"
  | "Premium"
  | "Coding"
  | "Research"
  | "Reasoning"
  | "Long context";

/** Whose model it is. Drives the mark drawn beside the name. */
export type ModelProvider = "anthropic" | "openai" | "google" | "deepseek";

export type ModelOption = {
  id: string;
  label: string;
  provider: ModelProvider;
  /** The one-line pitch, in the picker under the name. */
  description: string;
  /** Context window in tokens, for display. */
  contextTokens: number;
  badges: ModelBadge[];
  /** False when the provider will not serve it to this deployment. */
  available: boolean;
  /** Why not. Shown in the picker so the gap is actionable. */
  unavailableReason?: string;
};

export type CuratedModel = Omit<ModelOption, "available" | "unavailableReason">;

/**
 * The four, in the order they should be offered.
 *
 * `id` is the string sent to the provider. Where a provider names a model
 * differently from how people do, the label is the human one — nobody asks for
 * `claude-opus-5-thinking`.
 */
export const CURATED_MODELS: CuratedModel[] = [
  {
    id: "claude-opus-5-thinking",
    label: "Claude Opus 5 Thinking",
    provider: "anthropic",
    description: "Best for deep reasoning and crypto research.",
    contextTokens: 1_000_000,
    badges: ["Reasoning", "Research", "Premium", "Long context"],
  },
  {
    id: "gpt-5",
    label: "GPT-5",
    provider: "openai",
    description: "Best for general AI, writing and coding.",
    contextTokens: 400_000,
    badges: ["Coding", "Premium", "Fast"],
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "google",
    description: "Best for long documents and multimodal reasoning.",
    contextTokens: 2_000_000,
    badges: ["Long context", "Research", "Premium"],
  },
  {
    id: "deepseek-v3.1",
    label: "DeepSeek V3.1",
    provider: "deepseek",
    description: "Best value for coding and fast responses.",
    contextTokens: 128_000,
    badges: ["Fast", "Coding"],
  },
];

/** Ids the provider must confirm before a model becomes selectable. */
export const CURATED_IDS = CURATED_MODELS.map((model) => model.id);

/** The one used when nothing else is available or chosen. */
export const FALLBACK_MODEL_ID = CURATED_MODELS[0].id;

export function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M context`;
  }
  return `${Math.round(tokens / 1000)}K context`;
}

/**
 * The allow-list, from `AI_MODELS` when set.
 *
 * Narrows the four rather than extending them. An operator restricting a
 * public deployment is the case this exists for; adding an uncurated model
 * would put an entry in the picker with no description and no badges.
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
