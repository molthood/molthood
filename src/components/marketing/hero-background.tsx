import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Decorative hero backdrop: one hairline grid, one soft overhead light, and a
 * fade into the page background. No imagery, no motion, no layout cost.
 */
function HeroBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}
    >
      <div className="bg-grid mask-fade absolute inset-0 opacity-40" />

      {/* A soft overhead bloom — lighter green, so it lifts off the field. */}
      <div
        className="absolute inset-x-0 top-[-20rem] h-[38rem]"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, color-mix(in oklab, white 26%, transparent) 0%, transparent 70%)",
        }}
      />

      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}

export { HeroBackground };
