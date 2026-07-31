import * as React from "react";

import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { SiteSurface } from "@/components/layout/site-surface";

/** Public marketing surface: landing, docs, and API pages. */
export default function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <SiteSurface>
      {/* First thing a keyboard reaches, and invisible until focused. Without
          it every visit starts by tabbing through the whole navigation. */}
      <a
        href="#content"
        className="sr-only bg-primary text-background rounded-md px-4 py-2 text-sm font-semibold focus-visible:not-sr-only focus-visible:absolute focus-visible:top-3 focus-visible:left-3 focus-visible:z-[60]"
      >
        Skip to content
      </a>
      <Navbar />
      <main id="content" className="flex-1">
        {children}
      </main>
      <Footer />
    </SiteSurface>
  );
}
