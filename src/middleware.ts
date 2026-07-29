import { NextResponse, type NextRequest } from "next/server";

/**
 * Host-based routing: the console lives on its own hostname.
 *
 * The app's files still sit under `src/app/console/`, because two route groups
 * cannot both own `/` — the marketing landing page already does. So the
 * `/console` segment survives internally and is rewritten away here, which
 * makes it invisible to anyone using the site.
 *
 * The rule is one canonical URL per page. `console.<domain>/agents` is the
 * console; `<domain>/console/agents` redirects to it rather than serving a
 * second copy. Two hostnames rendering the same page would split bookmarks,
 * confuse anyone sharing a link, and make analytics count one visit twice.
 */

/** Hosts that serve the console. `console.localhost` covers development. */
function isConsoleHost(host: string): boolean {
  const name = host.split(":")[0].toLowerCase();
  return name === "console.localhost" || name.startsWith("console.");
}

function isDocsHost(host: string): boolean {
  return host.split(":")[0].toLowerCase().startsWith("docs.");
}

/** Where to send someone who reached a console path on the marketing host. */
function consoleOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_CONSOLE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const host = request.headers.get("host") ?? "";
  const name = host.split(":")[0];
  const port = host.includes(":") ? `:${host.split(":")[1]}` : "";

  // localhost has no registrable domain to prefix, so development keeps
  // serving /console in place rather than redirecting into a host that may
  // not resolve.
  if (name === "localhost" || name === "127.0.0.1") return "";

  return `https://console.${name.replace(/^www\./, "")}${port}`;
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname, search } = request.nextUrl;

  if (isConsoleHost(host)) {
    // A stale bookmark or an old inbound link. Strip the segment rather than
    // serve the page at a second address.
    if (pathname === "/console" || pathname.startsWith("/console/")) {
      const stripped = pathname.slice("/console".length) || "/";
      return NextResponse.redirect(new URL(`${stripped}${search}`, request.url));
    }

    // `/agents` on the console host is `/console/agents` in the app. The
    // address bar does not change: this is a rewrite, not a redirect.
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/console" : `/console${pathname}`;
    return NextResponse.rewrite(url);
  }

  /**
   * Docs is a redirect, not a rewrite — and the difference is structural.
   *
   * The console is self-contained: its own layout, its own navigation, every
   * link pointing inside itself. Rewriting its host is invisible because
   * nothing it renders refers to the world outside.
   *
   * `/docs` is not. It sits in the marketing layout and shares a navbar with
   * `/` and `/api`. Rewriting `docs.<domain>/*` to `/docs/*` would turn that
   * navbar's own "API" link into `/docs/api`, which does not exist. Making it
   * work would mean absolutising every marketing link to serve one alias.
   */
  if (isDocsHost(host)) {
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://molthood.org";
    const target = pathname === "/" ? "/docs" : pathname;
    return NextResponse.redirect(`${site}${target}${search}`);
  }

  // On the marketing host the console's own routes must not resolve at all,
  // or every page would exist twice.
  if (pathname === "/console" || pathname.startsWith("/console/")) {
    const origin = consoleOrigin(request);
    if (!origin) return NextResponse.next();

    const stripped = pathname.slice("/console".length) || "/";
    return NextResponse.redirect(`${origin}${stripped}${search}`);
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
