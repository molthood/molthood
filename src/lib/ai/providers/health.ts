/**
 * Which routes can actually answer right now.
 *
 * A configured key is not the same as a working one. On this deployment the
 * Google key is valid and out of quota, and the DeepSeek key is valid with no
 * balance — both return a perfectly well-formed error. Treating "configured"
 * as "available" would have put two models in the picker that fail on use.
 *
 * So health is *observed*, and it is observed cheaply: the catalogue endpoint,
 * not a completion. Real failures during a stream are recorded here too, which
 * is what makes the second request after an outage skip the dead route instead
 * of rediscovering it.
 */

import { PROVIDERS, type CATALOGUE } from "@/lib/ai/providers/registry";
import { isConfigured, type ModelRoute, type ProviderId } from "@/lib/ai/providers/types";

type Health = { ok: boolean; checkedAt: number; reason?: string };

const TTL_OK = 5 * 60 * 1000;
/** Re-checked sooner than a healthy one: an outage is usually temporary. */
const TTL_FAIL = 60 * 1000;

const state = new Map<ProviderId, Health>();

/** Marks a provider dead after a live failure, so the next request skips it. */
export function reportFailure(provider: ProviderId, reason: string): void {
  state.set(provider, { ok: false, checkedAt: Date.now(), reason });
}

export function reportSuccess(provider: ProviderId): void {
  state.set(provider, { ok: true, checkedAt: Date.now() });
}

async function probe(id: ProviderId): Promise<Health> {
  const provider = PROVIDERS[id];

  if (!isConfigured(provider)) {
    return { ok: false, checkedAt: Date.now(), reason: "missing_key" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(`${provider.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      signal: controller.signal,
      cache: "no-store",
    });

    return response.ok
      ? { ok: true, checkedAt: Date.now() }
      : { ok: false, checkedAt: Date.now(), reason: `http_${response.status}` };
  } catch {
    return { ok: false, checkedAt: Date.now(), reason: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

async function healthOf(id: ProviderId): Promise<Health> {
  const cached = state.get(id);
  if (cached) {
    const ttl = cached.ok ? TTL_OK : TTL_FAIL;
    if (Date.now() - cached.checkedAt < ttl) return cached;
  }

  const fresh = await probe(id);
  state.set(id, fresh);
  return fresh;
}

/** Every route for a model whose provider is currently answering, in order. */
export async function usableRoutes(
  model: (typeof CATALOGUE)[number],
): Promise<ModelRoute[]> {
  const checks = await Promise.all(
    [...new Set(model.routes.map((route) => route.provider))].map(
      async (id) => [id, await healthOf(id)] as const,
    ),
  );
  const healthy = new Map(checks);

  return model.routes.filter((route) => healthy.get(route.provider)?.ok);
}

/**
 * Diagnostics for `/api/agent/health`. Never surfaced in the conversation.
 *
 * `reachable` rather than `ok`, and the distinction is the point. The probe
 * asks for the catalogue, which both Google and DeepSeek answer perfectly
 * while refusing every completion — one is out of quota, the other out of
 * balance. Calling that "ok" would be a status page reporting green for a
 * service that cannot do the only thing anyone wants from it.
 *
 * A real failure during a stream is recorded here and shows up as
 * `last_error`, which is the only signal that reflects actual use.
 */
export async function providerReport(): Promise<
  {
    id: ProviderId;
    name: string;
    configured: boolean;
    reachable: boolean;
    last_error?: string;
    note?: string;
  }[]
> {
  return Promise.all(
    (Object.keys(PROVIDERS) as ProviderId[]).map(async (id) => {
      const health = await healthOf(id);
      return {
        id,
        name: PROVIDERS[id].name,
        configured: isConfigured(PROVIDERS[id]),
        reachable: health.ok,
        last_error: health.reason,
        note: health.ok
          ? "Catalogue answered. Not a guarantee that completions will."
          : undefined,
      };
    }),
  );
}
