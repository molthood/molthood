/**
 * Abuse and spend control for the public Agent endpoint.
 *
 * `/api/agent/chat` is unauthenticated by design — the point is that anyone can
 * ask a question without signing up — and every call spends real inference
 * credit. Those two facts together are a standing invitation, and a product
 * announced to a crypto audience will find that out within hours.
 *
 * Two independent limits, for two different failure modes:
 *
 * - **Per address**, so one script cannot monopolise the service.
 * - **Global daily**, a hard ceiling on what a single day can cost. This is the
 *   one that matters: it caps the bill even if the per-address limit is evaded
 *   by a botnet, which it can be.
 *
 * Backed by Redis when it is configured, because a serverless deployment runs
 * many instances and an in-process counter caps nothing across them. Without
 * Redis it degrades to per-instance memory, which stops casual abuse and is
 * honest about not stopping determined abuse — `limiterBacking()` reports
 * which is in force rather than leaving it to be assumed.
 */

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";

/** Requests one address may make in a window. */
const PER_ADDRESS = Number(process.env.AI_RATE_PER_IP ?? 12);
const WINDOW_SECONDS = Number(process.env.AI_RATE_WINDOW_SECONDS ?? 300);

/** Requests the whole deployment may serve in a day. */
const GLOBAL_DAILY = Number(process.env.AI_RATE_GLOBAL_DAILY ?? 2000);

export type LimitVerdict =
  | { allowed: true }
  | { allowed: false; reason: "per_address" | "global"; retryAfterSeconds: number };

export function limiterBacking(): "redis" | "memory" {
  return REDIS_URL && REDIS_TOKEN ? "redis" : "memory";
}

/* ------------------------------------------------------------------ */
/* Redis                                                               */
/* ------------------------------------------------------------------ */

/**
 * `INCR` then `EXPIRE`, in one round trip.
 *
 * Incrementing first and only setting the expiry on the first hit is what
 * makes this a fixed window rather than a counter that never resets. A
 * read-then-write would race between instances and undercount exactly when
 * load is highest.
 */
async function bump(key: string, ttlSeconds: number): Promise<number | null> {
  try {
    const response = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(ttlSeconds), "NX"],
      ]),
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return null;

    const body = (await response.json()) as { result?: unknown }[];
    const count = Number(body?.[0]?.result);
    return Number.isFinite(count) ? count : null;
  } catch {
    // A limiter that fails closed would take the product down with Redis.
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Memory                                                              */
/* ------------------------------------------------------------------ */

const counters = new Map<string, { count: number; resetAt: number }>();

function bumpLocal(key: string, ttlSeconds: number): number {
  const now = Date.now();
  const existing = counters.get(key);

  if (!existing || existing.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + ttlSeconds * 1000 });
    // Opportunistic sweep. Without it this map is a slow leak on a long-lived
    // instance, keyed by every address that ever called.
    if (counters.size > 5000) {
      for (const [entry, value] of counters) {
        if (value.resetAt <= now) counters.delete(entry);
      }
    }
    return 1;
  }

  existing.count += 1;
  return existing.count;
}

/* ------------------------------------------------------------------ */

async function count(key: string, ttlSeconds: number): Promise<number> {
  if (limiterBacking() === "redis") {
    const remote = await bump(key, ttlSeconds);
    if (remote !== null) return remote;
    // Redis unreachable: fall back rather than fail the request.
  }
  return bumpLocal(key, ttlSeconds);
}

/** The caller's address, as far as the platform can tell. */
export function addressOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function checkLimit(request: Request): Promise<LimitVerdict> {
  const day = new Date().toISOString().slice(0, 10);

  const global = await count(`molthood:agent:day:${day}`, 86_400);
  if (global > GLOBAL_DAILY) {
    const midnight = Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate() + 1,
    );
    return {
      allowed: false,
      reason: "global",
      retryAfterSeconds: Math.max(1, Math.ceil((midnight - Date.now()) / 1000)),
    };
  }

  const address = addressOf(request);
  const perAddress = await count(
    `molthood:agent:ip:${address}:${Math.floor(Date.now() / (WINDOW_SECONDS * 1000))}`,
    WINDOW_SECONDS,
  );
  if (perAddress > PER_ADDRESS) {
    return { allowed: false, reason: "per_address", retryAfterSeconds: WINDOW_SECONDS };
  }

  return { allowed: true };
}
