/**
 * Which providers exist, and which models route through them.
 *
 * Adding a provider is one entry in `PROVIDERS` plus its key in the
 * environment. Adding a model is one entry in `CATALOGUE`. Neither requires a
 * change anywhere in the interface — the picker renders whatever resolves.
 *
 * **Every key is read server-side.** None of these names carries a
 * `NEXT_PUBLIC_` prefix, because anything that does is inlined into the
 * JavaScript bundle and served to every visitor, and each of these keys spends
 * money.
 */

import type { CatalogueModel, Provider, ProviderId } from "@/lib/ai/providers/types";

export const PROVIDERS: Record<ProviderId, Provider> = {
  gorouter: {
    id: "gorouter",
    name: "GoRouter",
    baseUrl: process.env.AI_BASE_URL ?? "https://gorouter.app/v1",
    apiKey: process.env.AI_API_KEY ?? "",
    capabilities: ["chat", "streaming", "tools", "reasoning"],
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: true,
  },
  google: {
    id: "google",
    name: "Google AI Studio",
    baseUrl:
      process.env.GOOGLE_AI_BASE_URL ??
      "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey: process.env.GOOGLE_AI_API_KEY ?? "",
    capabilities: ["chat", "streaming", "tools", "vision", "reasoning"],
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
    apiKey: process.env.DEEPSEEK_API_KEY ?? "",
    capabilities: ["chat", "streaming", "tools", "reasoning"],
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsReasoning: true,
  },
  virtuals: {
    id: "virtuals",
    name: "Virtuals Compute",
    baseUrl: process.env.VIRTUALS_BASE_URL ?? "https://compute.virtuals.io/v1",
    apiKey: process.env.VIRTUALS_API_KEY ?? "",
    capabilities: ["chat", "streaming", "tools", "vision", "reasoning"],
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsReasoning: true,
  },
};

/**
 * The models offered, each with every way of reaching it.
 *
 * The route order encodes preference, and it is not arbitrary. Where a direct
 * account exists it goes first — it is the cheaper path and the one whose
 * quota the operator controls. Virtuals sits last on most entries as the
 * broad-catalogue fallback that carries almost every model, which is what
 * makes Gemini and DeepSeek answerable at all while their direct accounts are
 * out of quota and out of balance respectively.
 */
export const CATALOGUE: CatalogueModel[] = [
  {
    id: "claude-opus-5-thinking",
    label: "Claude Opus 5 Thinking",
    provider: "anthropic",
    description: "Best for deep reasoning and crypto research.",
    contextTokens: 1_000_000,
    badges: ["Reasoning", "Premium"],
    routes: [
      { provider: "gorouter", model: "claude-opus-5-thinking" },
      { provider: "virtuals", model: "anthropic-claude-opus-5" },
    ],
  },
  {
    id: "gemini-pro",
    label: "Gemini 2.5 Pro",
    provider: "google",
    description: "Best for long documents and multimodal reasoning.",
    contextTokens: 1_000_000,
    badges: ["Research", "Long context"],
    routes: [
      // The preferred route, as asked. It is currently out of quota on this
      // key, which is exactly the case the rest of the list exists for.
      { provider: "google", model: "gemini-2.5-pro" },
      { provider: "google", model: "gemini-flash-latest" },
      { provider: "virtuals", model: "google-gemini-3-1-pro-preview" },
    ],
  },
  {
    id: "deepseek-reasoner",
    label: "DeepSeek Reasoner",
    provider: "deepseek",
    description: "Best value for coding and fast responses.",
    contextTokens: 1_000_000,
    badges: ["Coding", "Fast"],
    routes: [
      { provider: "deepseek", model: "deepseek-v4-pro" },
      { provider: "deepseek", model: "deepseek-v4-flash" },
      { provider: "virtuals", model: "deepseek-deepseek-v4-pro" },
    ],
  },
  {
    id: "gpt-5",
    label: "GPT-5",
    provider: "openai",
    description: "Best for general AI, writing and coding.",
    contextTokens: 1_000_000,
    badges: ["Coding", "Premium"],
    routes: [{ provider: "virtuals", model: "openai-gpt-55" }],
  },
];

export const DEFAULT_MODEL_ID = CATALOGUE[0].id;

export function findModel(id: string): CatalogueModel | undefined {
  return CATALOGUE.find((model) => model.id === id);
}

/**
 * Ids an operator has restricted this deployment to, if any.
 *
 * Narrows the catalogue rather than extending it — an uncurated id would reach
 * the picker with no description, no badges and no route.
 */
export function allowedModelIds(): string[] | null {
  const raw = process.env.AI_MODELS?.trim();
  if (!raw) return null;
  const ids = raw.split(",").map((id) => id.trim()).filter(Boolean);
  return ids.length > 0 ? ids : null;
}
