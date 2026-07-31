/**
 * The models Molthood Agent will accept, resolved once and shared.
 *
 * Fetched from the provider rather than written down, so a model added
 * upstream appears in the selector without a deploy. Cached in the module for
 * a few minutes: the catalogue changes on the order of weeks, and the picker
 * opens on every page load.
 */

import { AI_API_KEY, AI_BASE_URL, AI_MODEL, isConfigured } from "@/lib/ai/config";
import {
  DEFAULT_MODEL_IDS,
  configuredModelIds,
  describeModel,
  type ModelOption,
} from "@/lib/ai/models";

const CACHE_MS = 5 * 60 * 1000;

export type Catalogue = {
  models: ModelOption[];
  defaultModel: string;
  /** False when the provider could not be reached and this is the fallback. */
  live: boolean;
};

let cached: { at: number; value: Catalogue } | null = null;

/** Ids the provider says exist, or null when it could not be asked. */
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

  const configured = configuredModelIds();
  const provider = isConfigured() ? await fetchProviderIds() : null;

  // `AI_MODELS` narrows the provider's list rather than replacing it, so an
  // operator can restrict a public deployment without having to maintain a
  // catalogue by hand. When the provider is unreachable it *is* the list.
  let ids = provider ?? configured ?? DEFAULT_MODEL_IDS;
  if (provider && configured) {
    const allowed = new Set(configured);
    const narrowed = provider.filter((id) => allowed.has(id));
    // An allow-list that matches nothing is a misconfiguration, not an
    // instruction to offer no models at all — falling through to an empty
    // picker would look like the provider was down.
    if (narrowed.length > 0) ids = narrowed;
  }

  // The configured default belongs in the list even if the catalogue omits it;
  // it is what an unlabelled request will use.
  if (!ids.includes(AI_MODEL)) ids = [AI_MODEL, ...ids];

  // The provider returns them in its own order, which put the previous
  // generation second. Curated order first, then anything new alphabetically —
  // a picker is a recommendation, and the top entry is the recommendation.
  const rank = (id: string) => {
    const index = DEFAULT_MODEL_IDS.indexOf(id);
    return index === -1 ? DEFAULT_MODEL_IDS.length : index;
  };
  const ordered = [...new Set(ids)].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b),
  );

  const value: Catalogue = {
    models: ordered.map(describeModel),
    defaultModel: AI_MODEL,
    live: provider !== null,
  };

  cached = { at: Date.now(), value };
  return value;
}

/**
 * The model to actually send, given what the client asked for.
 *
 * Validated against the catalogue rather than passed through. The request body
 * is public: without this, anyone could name any string as the model — a
 * typo becomes a 400 from the provider mid-stream, and a real id outside the
 * allow-list bills this deployment for a model it never chose to offer.
 */
export async function resolveModel(requested: unknown): Promise<string> {
  if (typeof requested !== "string" || !requested.trim()) return AI_MODEL;

  const { models } = await resolveCatalogue();
  return models.some((model) => model.id === requested) ? requested : AI_MODEL;
}
