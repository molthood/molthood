"use client";

import * as React from "react";
import { useSelectedLayoutSegment } from "next/navigation";

import { SurfaceTheme } from "@/components/layout/surface-theme";
import { cn } from "@/lib/utils";

/**
 * Picks the palette for the public surface.
 *
 * Documentation is dark; the landing page is not. They share a layout because
 * they share the navigation and the footer, and the choice has to be made
 * above both — a wrapper inside `<main>` would have left a green footer under
 * a black page.
 *
 * The segment, not the pathname. Middleware serves the docs host by rewriting
 * `/` to `/docs`, so on docs.molthood.org the URL a visitor sees is
 * `/concepts/evidence` and a `startsWith("/docs")` test is false — it passes
 * locally, where the prefix is really in the address, and fails in
 * production, which is the worst shape a bug can have.
 * `useSelectedLayoutSegment` reads the route tree instead of the URL, so the
 * rewrite is invisible to it.
 *
 * Client-side rather than a header read in the server layout: the latter
 * would opt every marketing route out of static rendering to answer a
 * question about colour.
 */
function SiteSurface({ children }: { children: React.ReactNode }) {
  const dark = useSelectedLayoutSegment() === "docs";

  return (
    <SurfaceTheme theme={dark ? "dark" : "light"}>
      <div
        className={cn(
          "flex min-h-dvh flex-col",
          dark && "molthood-dark molthood-dark-page bg-background",
        )}
      >
        {children}
      </div>
    </SurfaceTheme>
  );
}

export { SiteSurface };
