/** The model catalogue, for the picker. */

import { AI_MODEL, isConfigured } from "@/lib/ai/config";
import { resolveCatalogue } from "@/lib/ai/catalogue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isConfigured()) {
    // A page that renders a picker with one greyed-out entry is clearer than
    // one that renders an empty box and looks broken.
    return Response.json({
      models: [],
      defaultModel: AI_MODEL,
      live: false,
      configured: false,
    });
  }

  const catalogue = await resolveCatalogue();
  return Response.json({ ...catalogue, configured: true });
}
