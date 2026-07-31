import { NextResponse, type NextRequest } from "next/server";

/**
 * Host-based routing. Three surfaces, three hostnames, one Next.js app.
 *
 *   molthood.org           the marketing site
 *   docs.molthood.org      the documentation, including the API reference
 *   console.molthood.org   the console
 *
 * The files still live under `/console` and `/docs` internally, because two
 * route groups cannot both own `/` — the landing page already does. Those
 * segments are rewritten away here, so they never appear in a URL.
 *
 * One canonical URL per page, enforced in both directions: a surface's own
 * host serves it, and every other host redirects there. Two hostnames
 * rendering the same page would split bookmarks, confuse anyone sharing a
 * link, and count one visit twice.
 *
 * `api.molthood.org` is deliberately absent. That name belongs to the API
 * itself, which is a different service on a different host entirely; the API
 * *reference* is a documentation page and lives at `docs.molthood.org/api`.
 */

/** The internal segment each host's routes are stored under. */
const SURFACES = [
  { prefix: "/console", matches: (name: string) => name.startsWith("console.") },
  { prefix: "/docs", matches: (name: string) => name.startsWith("docs.") },
  // The developer platform. A fourth surface is one entry here, which is the
  // whole point of the table — the routing logic below did not change.
  { prefix: "/dashboard", matches: (name: string) => name.startsWith("dashboard.") },
] as const;

function hostname(host: string): string {
  return host.split(":")[0].toLowerCase();
}

/** Which surface this host serves, or null for the marketing site. */
function surfaceFor(host: string): (typeof SURFACES)[number] | null {
  const name = hostname(host);
  return SURFACES.find((surface) => surface.matches(name)) ?? null;
}

/**
 * The public origin for a surface, derived from the host being served.
 *
 * Derived rather than hardcoded so a preview deployment redirects within
 * itself instead of throwing visitors back to production.
 */
function originFor(prefix: string, request: NextRequest): string {
  const configured =
    prefix === "/console"
      ? process.env.NEXT_PUBLIC_CONSOLE_URL
      : prefix === "/docs"
        ? process.env.NEXT_PUBLIC_DOCS_URL
        : process.env.NEXT_PUBLIC_DASHBOARD_URL;
  if (configured) return configured.replace(/\/$/, "");

  const host = request.headers.get("host") ?? "";
  const name = hostname(host);
  const port = host.includes(":") ? `:${host.split(":")[1]}` : "";

  // localhost has no registrable domain to prefix, so development keeps
  // serving the internal path in place rather than redirecting to a host that
  // may not resolve.
  if (name === "localhost" || name === "127.0.0.1") return "";

  // Strip whatever subdomain we are *currently* on before adding the target's.
  // Without this, a link from the docs host to the console builds
  // `console.docs.molthood.org` — a hostname that does not exist, from a
  // redirect that looked correct in every single-host test.
  const base = name.replace(/^(www|console|docs|dashboard)\./, "");
  return `https://${prefix.slice(1)}.${base}${port}`;
}

/**
 * Paths that used to exist on the marketing site and have moved.
 *
 * `/api` was the API reference before the docs got their own hostname. Links
 * to it are already published, so it redirects rather than 404s — which is
 * what it did until this map existed.
 */
const MOVED: Record<string, { prefix: string; path: string }> = {
  "/api": { prefix: "/docs", path: "/api" },
};

/**
 * Paths that moved **within** the marketing site.
 *
 * `/ai` shipped before the assistant had its name. A published URL that starts
 * answering 404 is the worst outcome of a rename, so it redirects instead.
 */
const RENAMED: Record<string, string> = {
  "/ai": "/askmoltagent",
};

/**
 * Paths that left a surface entirely, keyed by the surface they left.
 *
 * The roadmap moved out of the developer platform and into the documentation.
 * It was linked from the platform's own sidebar, so leaving it to 404 would
 * break a link this product published itself.
 */
const RELOCATED: Record<string, Record<string, { prefix: string; path: string }>> = {
  "/dashboard": {
    "/roadmap": { prefix: "/docs", path: "/roadmap" },
  },
};

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname, search } = request.nextUrl;
  const surface = surfaceFor(host);

  // A path belonging to some *other* surface, arriving on this host. This is
  // the case that shipped broken: console.molthood.org/docs was rewritten into
  // the console's own routes and 404'd, and the site's own footer linked
  // straight to it.
  for (const other of SURFACES) {
    if (other === surface) continue;
    if (pathname !== other.prefix && !pathname.startsWith(`${other.prefix}/`)) {
      continue;
    }
    const origin = originFor(other.prefix, request);
    if (!origin) return NextResponse.next();
    const stripped = pathname.slice(other.prefix.length) || "/";
    return NextResponse.redirect(`${origin}${stripped}${search}`);
  }

  if (!surface) {
    const renamed = RENAMED[pathname];
    if (renamed) {
      return NextResponse.redirect(new URL(`${renamed}${search}`, request.url), 308);
    }
  }

  // Old marketing URLs. Skipped on the surface that now owns the path, where
  // it is a real page rather than a relocation.
  const moved = MOVED[pathname];
  if (moved && surface?.prefix !== moved.prefix) {
    const origin = originFor(moved.prefix, request);
    if (origin) return NextResponse.redirect(`${origin}${moved.path}${search}`);
  }

  if (surface) {
    const relocated = RELOCATED[surface.prefix]?.[pathname];
    if (relocated) {
      const origin = originFor(relocated.prefix, request);
      if (origin) {
        return NextResponse.redirect(`${origin}${relocated.path}${search}`, 308);
      }
    }

    // A stale bookmark or an old inbound link still carrying the segment.
    // Strip it rather than serve the page at a second address.
    if (pathname === surface.prefix || pathname.startsWith(`${surface.prefix}/`)) {
      const stripped = pathname.slice(surface.prefix.length) || "/";
      return NextResponse.redirect(new URL(`${stripped}${search}`, request.url));
    }

    // `/agents` on the console host is `/console/agents` in the app. The
    // address bar does not change: this is a rewrite, not a redirect.
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? surface.prefix : `${surface.prefix}${pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Everything except Next's own assets.
   *
   * This exclusion is the whole reason a rewrite is safe here: without it,
   * `/_next/static/chunk.js` on the console host would be rewritten to
   * `/console/_next/static/chunk.js` and 404, taking the styling and the
   * JavaScript with it.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};
