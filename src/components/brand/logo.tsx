import * as React from "react";

import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

export type LogoMarkProps = React.ComponentProps<"svg">;

/**
 * Molthood mark — an ascending shard, read as a feather quill split down the
 * spine. Geometric so it stays legible at 16px in a sidebar or favicon.
 */
function LogoMark({ className, ...props }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("size-6", className)}
      {...props}
    >
      <path
        d="M12 2.5 4.5 21.5l7.5-5.6V2.5Z"
        fill="currentColor"
        fillOpacity="0.42"
      />
      <path d="M12 2.5 19.5 21.5 12 15.9V2.5Z" fill="currentColor" />
    </svg>
  );
}

export type LogoProps = React.ComponentProps<"div"> & {
  /** Hide the wordmark and show the mark alone (collapsed sidebar, mobile). */
  markOnly?: boolean;
};

function Logo({ className, markOnly = false, ...props }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)} {...props}>
      <LogoMark className="size-[22px] text-primary" />
      {markOnly ? (
        <span className="sr-only">{siteConfig.name}</span>
      ) : (
        <span className="font-display text-[15px] font-bold tracking-[-0.015em] text-foreground">
          {siteConfig.name}
        </span>
      )}
    </div>
  );
}

export { Logo, LogoMark };
