/** The model catalogue, for the picker. */

import { resolveCatalogue } from "@/lib/ai/catalogue";
import { anyProviderConfigured } from "@/lib/ai/config";
import { DEFAULT_MODEL_ID } from "@/lib/ai/providers/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!anyProviderConfigured()) {
    return Response.json({
      models: [],
      defaultModel: DEFAULT_MODEL_ID,
      configured: false,
    });
  }

  const catalogue = await resolveCatalogue();
  return Response.json({ ...catalogue, configured: true });
}
