import type { Metadata } from "next";
import * as React from "react";

import { SITE_URL } from "@/config/site";
import { pageMetadata } from "@/lib/seo";

import { ChatBackdrop } from "@/components/ai/chat-backdrop";
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
      {/* `bg-background` stays on the wrapper even though the backdrop covers
          it: an element's own background paints before its children, so there
          is solid black underneath from the first frame and no white flash
          while the video is still being fetched.

          `isolate` keeps the backdrop's stacking context local, so a dropdown
          or the artifact workspace cannot end up behind it. */}
      <div className="molthood-dark molthood-dark-page bg-background relative isolate flex h-dvh flex-col overflow-hidden">
        <ChatBackdrop />
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <Navbar />
          {children}
        </div>
      </div>
    </SurfaceTheme>
  );
}
