/**
 * Provider diagnostics.
 *
 * Separate from the conversation on purpose: a reader asking about a wallet
 * has no use for the fact that one of four upstreams is out of quota, and the
 * fallback exists precisely so they never need to know. This is for whoever
 * operates the deployment.
 */

import { providerReport } from "@/lib/ai/providers/health";
import { resolveCatalogue } from "@/lib/ai/catalogue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [providers, catalogue] = await Promise.all([
    providerReport(),
    resolveCatalogue(),
  ]);

  return Response.json({
    providers,
    models_offered: catalogue.models.map((model) => model.id),
    default_model: catalogue.defaultModel,
  });
}
