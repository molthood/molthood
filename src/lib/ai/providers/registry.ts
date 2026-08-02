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

import { CURATED_MODELS } from "@/config/agent-models";
import type {
  CatalogueModel,
  ModelRoute,
  Provider,
  ProviderId,
} from "@/lib/ai/providers/types";

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
/** Where each model can be reached, in preference order. */
const ROUTES: Record<string, ModelRoute[]> = {
  "claude-opus-5-thinking": [
    { provider: "gorouter", model: "claude-opus-5-thinking" },
    { provider: "virtuals", model: "anthropic-claude-opus-5" },
  ],
  // Not served by the primary provider's catalogue, so Virtuals-only until it
  // appears there.
  "claude-sonnet-5": [{ provider: "virtuals", model: "anthropic-claude-sonnet-5" }],
  "gemini-pro": [
    // The preferred route. It is out of quota on this key, which is exactly
    // the case the rest of the list exists for.
    { provider: "google", model: "gemini-2.5-pro" },
    { provider: "google", model: "gemini-flash-latest" },
    { provider: "virtuals", model: "google-gemini-3-1-pro-preview" },
  ],
  "deepseek-reasoner": [
    { provider: "deepseek", model: "deepseek-v4-pro" },
    { provider: "deepseek", model: "deepseek-v4-flash" },
    { provider: "virtuals", model: "deepseek-deepseek-v4-pro" },
  ],
  "gpt-5": [{ provider: "virtuals", model: "openai-gpt-55" }],
};

/**
 * The offered models, display data and routes joined.
 *
 * The descriptions live in `config/agent-models.ts` so the landing page can
 * render them without importing this file, which reads provider keys.
 */
export const CATALOGUE: CatalogueModel[] = CURATED_MODELS.map((model) => ({
  ...model,
  routes: ROUTES[model.id] ?? [],
})).filter((model) => model.routes.length > 0);

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
