"use client";

import * as React from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

import { Container } from "@/components/layout/container";
import { cn } from "@/lib/utils";

/**
 * The transition from navigation to hero.
 *
 * A note on the palette, because it inverts the obvious reading. Molthood's
 * field is neon green and its accent is **dark ink** — `globals.css` says so
 * where `--color-primary` is defined. So a hairline that brightens toward the
 * centre would disappear into the background; this one *darkens* toward it.
 * Same intent as a light accent on a dark page, arrived at from the other
 * side.
 *
 * Three layers, none of which should be consciously noticed:
 *
 * 1. A 1px hairline that fades in from transparent, deepens through the border
 *    green, and reaches ink at the centre.
 * 2. A soft wash beneath it at very low opacity — blended into the page rather
 *    than cast onto it, so it reads as depth and not as a shadow.
 * 3. A small mark at the centre, taken from the logo's geometry.
 *
 * Deliberately **not** a border on the navbar. A border is edge-to-edge and
 * belongs to the element it sits on; this is its own element, aligned to the
 * content container, so it lines up with the hero rather than with the window.
 */
function SectionDivider({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  // Six pixels across the whole scroll range. Enough that the divider does not
  // feel welded to the navigation, little enough that nobody catches it moving.
  const y = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : 6]);

  return (
    <div ref={ref} className={cn("relative", className)} aria-hidden="true">
      <Container size="xl">
        <motion.div
          style={{ y }}
          initial={reduceMotion ? false : { opacity: 0, scaleX: 0.98 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative h-px w-full"
        >
          {/* Layer 2, first in the stack so the hairline sits over it. The
              blur is wider than it is tall and sits below the line, which is
              what makes it read as the page receding rather than as the line
              casting something. */}
          <span
            className="absolute inset-x-[12%] top-0 h-6 -translate-y-1/2 blur-[10px]"
            style={{
              background:
                "linear-gradient(90deg, transparent, color-mix(in oklab, var(--color-foreground) 14%, transparent) 45%, color-mix(in oklab, var(--color-foreground) 18%, transparent) 50%, color-mix(in oklab, var(--color-foreground) 14%, transparent) 55%, transparent)",
              opacity: 0.5,
            }}
          />

          {/* Layer 1. Two stops either side of the centre rather than one, so
              the line arrives and leaves rather than switching colour. */}
          <span
            className="absolute inset-0 block"
            style={{
              background:
                "linear-gradient(90deg, transparent, color-mix(in oklab, var(--color-border-strong) 55%, transparent) 22%, color-mix(in oklab, var(--color-foreground) 55%, transparent) 42%, var(--color-foreground) 50%, color-mix(in oklab, var(--color-foreground) 55%, transparent) 58%, color-mix(in oklab, var(--color-border-strong) 55%, transparent) 78%, transparent)",
            }}
          />

          {/* Layer 3. Sits on the line rather than beside it, so the hairline
              appears to pass behind the mark. */}
          <motion.span
            initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-1/2 left-1/2 flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background"
          >
            <DividerMark />
          </motion.span>
        </motion.div>
      </Container>
    </div>
  );
}

/**
 * The logo's geometry at 10px: two facets meeting at a spine.
 *
 * Not the logo itself. At this size the artwork's detail becomes noise, and a
 * shrunken logo reads as a mistake rather than a motif — so this is the shape
 * the logo is built from, which survives being small.
 */
function DividerMark() {
  return (
    <svg viewBox="0 0 12 12" className="size-2.5" fill="none">
      <path d="M6 1.5 2.6 10.5 6 8.2V1.5Z" fill="currentColor" fillOpacity="0.35" />
      <path d="M6 1.5 9.4 10.5 6 8.2V1.5Z" fill="currentColor" fillOpacity="0.75" />
    </svg>
  );
}

export { SectionDivider };
