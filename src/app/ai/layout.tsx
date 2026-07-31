import type { Metadata } from "next";
import * as React from "react";

import { Navbar } from "@/components/layout/navbar";
import { SurfaceTheme } from "@/components/layout/surface-theme";

export const metadata: Metadata = {
  title: "Molt AI",
  description:
    "Ask Molt AI about Robinhood Chain, a wallet, a token, a contract, or anything crypto. It reaches Molthood's own analysis APIs and says what it could not check.",
};

/**
 * Molt AI's own surface.
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
