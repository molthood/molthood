import * as React from "react";

import { Container } from "@/components/layout/container";
import { cn } from "@/lib/utils";

/**
 * The transition between sections.
 *
 * **CSS first, motion second.** The first version wrapped this in a motion
 * component whose `initial` was `opacity: 0`; the entrance never ran and the
 * divider shipped fully transparent — present in the DOM, invisible on the
 * page. A decorative element must never depend on JavaScript to become
 * visible, because when it does the failure looks like nothing happened at
 * all, which is the hardest kind to notice.
 *
 * So the hairline is plain CSS and always drawn. The entrance is a keyframe
 * animation, which either runs or is skipped — it cannot leave the element
 * stuck at zero.
 *
 * A note on the palette, because it inverts the obvious reading. Molthood's
 * field is neon green and its accent is **dark ink** — `globals.css` says so
 * where `--color-primary` is defined. A hairline brightening toward its centre
 * would vanish into the background, so this one darkens toward it: the same
 * intent as a light accent on a dark page, reached from the other side.
 */
function SectionDivider({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)} aria-hidden="true">
      <Container size="xl">
        <div className="molthood-divider relative h-px w-full">
          {/* Beneath the line and wider than it is tall, so it reads as the
              page receding rather than as the line casting a shadow. */}
          <span className="molthood-divider-wash absolute inset-x-[10%] top-0 h-5 -translate-y-1/2 blur-[8px]" />

          {/* The hairline. Two stops either side of centre rather than one, so
              it arrives and leaves instead of switching colour. */}
          <span className="molthood-divider-line absolute inset-0 block" />

          {/* On the line rather than beside it, so the hairline appears to
              pass behind the mark. */}
          <span className="bg-background absolute top-1/2 left-1/2 flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full">
            <DividerMark />
          </span>
        </div>
      </Container>
    </div>
  );
}

/**
 * The logo's geometry at ten pixels: two facets meeting at a spine.
 *
 * Not the logo itself. At this size the artwork's detail becomes noise and a
 * shrunken logo reads as a mistake rather than a motif; the shape it is built
 * from survives being small.
 */
function DividerMark() {
  return (
    <svg viewBox="0 0 12 12" className="text-foreground size-2.5" fill="none">
      <path d="M6 1.5 2.6 10.5 6 8.2V1.5Z" fill="currentColor" fillOpacity="0.4" />
      <path d="M6 1.5 9.4 10.5 6 8.2V1.5Z" fill="currentColor" fillOpacity="0.8" />
    </svg>
  );
}

export { SectionDivider };
