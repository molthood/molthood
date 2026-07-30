import * as React from "react";
import Image from "next/image";

import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

export type LogoMarkProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** Rendered size in CSS pixels. The source is square. */
  size?: number;
};

/**
 * The Molthood mark.
 *
 * A raster source at a fixed intrinsic size rather than an `<img>` with a bare
 * `src`: `next/image` emits width and height, so the header does not reflow
 * once the file arrives. A logo that shifts the whole navigation on load is
 * the most visible layout shift a site can have, because it is at the top of
 * every page.
 *
 * `priority` for the same reason — this is above the fold on all four
 * surfaces, so lazy-loading it would guarantee the shift it exists to avoid.
 */
function LogoMark({ className, size = 22, ...props }: LogoMarkProps) {
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
      {...props}
    >
      <Image
        src="/logo.png"
        alt=""
        width={size}
        height={size}
        priority
        // Decorative here: the wordmark beside it already names the product,
        // and a screen reader announcing "Molthood Molthood" is worse than
        // announcing it once.
        aria-hidden="true"
        className="size-full object-contain"
      />
    </span>
  );
}

export type LogoProps = React.ComponentProps<"div"> & {
  /** Hide the wordmark and show the mark alone (collapsed sidebar, mobile). */
  markOnly?: boolean;
};

function Logo({ className, markOnly = false, ...props }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)} {...props}>
      <LogoMark />
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
