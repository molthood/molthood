import * as React from "react";
import { ArrowLeft } from "lucide-react";

import { SITE_URL } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * The way out of an application surface.
 *
 * A plain `<a>` rather than a `next/link`: `SITE_URL` is a different host in
 * production, and the client router cannot navigate across origins. The mark
 * in the header already points here, but a logo is not a signposted exit —
 * nothing about it says where it goes.
 *
 * The label shortens rather than disappearing on small screens. A bare arrow
 * with no word beside it is a back *button*, which promises browser history;
 * this always goes to one fixed place.
 */
function BackToLanding({ className }: { className?: string }) {
  return (
    <a
      href={SITE_URL}
      className={cn(
        "text-muted hover:text-foreground hover:border-border-strong",
        "border-border inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border",
        "px-2.5 text-[13px] font-semibold transition-colors",
        className,
      )}
    >
      <ArrowLeft className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="hidden sm:inline">Back to Landing</span>
      <span className="sm:hidden">Home</span>
    </a>
  );
}

export { BackToLanding };
