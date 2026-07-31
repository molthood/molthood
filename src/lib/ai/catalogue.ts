/**
 * Which models this deployment can actually offer.
 *
 * A model is offered when at least one of its routes has a provider that is
 * answering. Nothing disabled is shown: a picker entry that cannot serve a
 * request is worse than a shorter list, because the failure only appears once
 * an answer is already expected.
 */

import { usableRoutes } from "@/lib/ai/providers/health";
import { CATALOGUE, DEFAULT_MODEL_ID, allowedModelIds } from "@/lib/ai/providers/registry";
import type { CatalogueModel } from "@/lib/ai/providers/types";

const CACHE_MS = 60 * 1000;

export type OfferedModel = Omit<CatalogueModel, "routes">;

export type Catalogue = {
  models: OfferedModel[];
  defaultModel: string;
};

let cached: { at: number; value: Catalogue } | null = null;

export async function resolveCatalogue(): Promise<Catalogue> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const allowed = allowedModelIds();
  const permitted = allowed
    ? CATALOGUE.filter((model) => allowed.includes(model.id))
    : CATALOGUE;

  const checked = await Promise.all(
    permitted.map(async (model) => ({
      model,
      routes: await usableRoutes(model),
    })),
  );

  const models = checked
    .filter((entry) => entry.routes.length > 0)
    // `routes` is deliberately dropped before this reaches the browser. It
    // names hosts and provider ids — the shape of the plumbing, and no part of
    // choosing a model.
    .map(({ model }): OfferedModel => ({
      id: model.id,
      label: model.label,
      provider: model.provider,
      description: model.description,
      contextTokens: model.contextTokens,
      badges: model.badges,
    }));

  const value: Catalogue = {
    models,
    defaultModel: models[0]?.id ?? DEFAULT_MODEL_ID,
  };

  cached = { at: Date.now(), value };
  return value;
}

/**
 * The model to actually use, given what the client asked for.
 *
 * Validated against what is offered rather than passed through. The request
 * body is public: an unvalidated id reaches a provider as a 400 mid-stream, or
 * bills this deployment for something it never chose to offer.
 */
export async function resolveModel(requested: unknown): Promise<string> {
  const { models, defaultModel } = await resolveCatalogue();

  if (typeof requested === "string" && requested.trim()) {
    if (models.some((model) => model.id === requested)) return requested;
  }
  return defaultModel;
}
