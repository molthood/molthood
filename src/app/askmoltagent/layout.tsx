import type { Metadata } from "next";
import * as React from "react";

import { SITE_URL } from "@/config/site";
import { pageMetadata } from "@/lib/seo";

import { Navbar } from "@/components/layout/navbar";
import { SurfaceTheme } from "@/components/layout/surface-theme";

export const metadata: Metadata = pageMetadata({
  title: "Molthood Agent",
  description:
    "Ask about Robinhood Chain, a wallet, a token, a contract, or anything crypto. Molthood Agent reaches live analysis data and says plainly what it could not check.",
  url: `${SITE_URL}/askmoltagent`,
});

/**
 * Molthood Agent's own surface.
 *
 * Outside `(site)` on purpose: a conversation fills the viewport and owns its
 * scrolling, which a marketing layout with a footer underneath cannot give it.
 * The navbar stays so the product still reads as one thing.
 */
export default function AiLayout({ children }: { children: React.ReactNode }) {
  return (
    <SurfaceTheme theme="dark">
      <div className="molthood-dark molthood-dark-page bg-background flex h-dvh flex-col overflow-hidden">
        <Navbar />
        {children}
      </div>
    </SurfaceTheme>
  );
}
