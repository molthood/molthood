/**
 * Which of the four models this deployment can actually reach.
 *
 * The curated list says what Molthood Agent offers; the provider says what it
 * will serve. Both matter, and conflating them is how a picker ends up with an
 * entry that 403s the moment somebody chooses it.
 *
 * Cached in the module for a few minutes: the answer changes when a key gains
 * access, which is on the order of never, and the picker opens on every load.
 */

import { AI_API_KEY, AI_BASE_URL, isConfigured } from "@/lib/ai/config";
import {
  CURATED_MODELS,
  FALLBACK_MODEL_ID,
  configuredModelIds,
  type ModelOption,
} from "@/lib/ai/models";

const CACHE_MS = 5 * 60 * 1000;

export type Catalogue = {
  models: ModelOption[];
  defaultModel: string;
  /** False when the provider could not be asked and this is an assumption. */
  live: boolean;
};

let cached: { at: number; value: Catalogue } | null = null;

/** Ids the provider says it serves, or null when it could not be asked. */
async function fetchProviderIds(): Promise<string[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${AI_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${AI_API_KEY}` },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return null;

    const body = (await response.json()) as { data?: { id?: string }[] };
    const ids = (body.data ?? [])
      .map((model) => model.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveCatalogue(): Promise<Catalogue> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const provider = isConfigured() ? await fetchProviderIds() : null;
  const allowed = configuredModelIds();

  const models: ModelOption[] = CURATED_MODELS.map((model) => {
    // An unreachable provider means *unknown*, not unavailable. Marking every
    // model dead because one request timed out would empty the picker over a
    // blip, which is the same mistake as reporting an unrun check as clean.
    const servedByProvider = provider === null || provider.includes(model.id);
    const permittedHere = !allowed || allowed.includes(model.id);

    if (!permittedHere) {
      return {
        ...model,
        available: false,
        unavailableReason: "Not enabled on this deployment.",
      };
    }
    if (!servedByProvider) {
      return {
        ...model,
        available: false,
        unavailableReason: "Requires provider access on this API key.",
      };
    }
    return { ...model, available: true };
  });

  const firstAvailable = models.find((model) => model.available);

  const value: Catalogue = {
    models,
    // Never default to something that cannot answer.
    defaultModel: firstAvailable?.id ?? FALLBACK_MODEL_ID,
    live: provider !== null,
  };

  cached = { at: Date.now(), value };
  return value;
}

/**
 * The model to actually send, given what the client asked for.
 *
 * Validated against the catalogue rather than passed through. The request body
 * is public: without this, anyone could name any string as the model — a typo
 * becomes a 400 mid-stream, and a real id outside the list bills this
 * deployment for a model it never chose to offer.
 */
export async function resolveModel(requested: unknown): Promise<string> {
  const { models, defaultModel } = await resolveCatalogue();

  if (typeof requested === "string" && requested.trim()) {
    const match = models.find((model) => model.id === requested);
    if (match?.available) return match.id;
  }

  return defaultModel;
}
