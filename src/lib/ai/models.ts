/**
 * Display types for a model, shared by the picker and the catalogue endpoint.
 *
 * The catalogue itself lives in `providers/registry.ts`, beside the routes
 * that make each entry answerable — keeping the two apart is how a model ends
 * up described in one file and unreachable according to another.
 */

export type {
  ModelBadge,
  ModelProvider,
} from "@/lib/ai/providers/types";

export type { OfferedModel as ModelOption } from "@/lib/ai/catalogue";

export function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M context`;
  }
  return `${Math.round(tokens / 1000)}K context`;
}
