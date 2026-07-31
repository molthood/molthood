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
function LogoMark({ className, size = 32, ...props }: LogoMarkProps) {
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
      {...props}
    >
      <Image
        src="/logo.png"
        alt=""
        // Rendered at three times the layout size and constrained by the
        // wrapper. `next/image` emits only 1x and 2x for a fixed width, so on
        // a 3x display — most phones — the mark was being upscaled from 64px
        // and lost its edges. Asking for the pixels directly is the only way
        // to be sharp on every device.
        width={size * 3}
        height={size * 3}
        // The source is 7 KB. Compressing a mark this small to save bytes
        // trades the one thing it has to do.
        quality={100}
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
    <div className={cn("flex items-center gap-2", className)} {...props}>
      <LogoMark />
      {markOnly ? (
        <span className="sr-only">{siteConfig.name}</span>
      ) : (
        <span
          className="font-display text-[20px] leading-none font-bold tracking-[-0.02em]"
          style={{ color: "var(--color-wordmark)" }}
        >
          {siteConfig.name}
        </span>
      )}
    </div>
  );
}

export { Logo, LogoMark };
