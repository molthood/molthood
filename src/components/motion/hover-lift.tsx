"use client";

import * as React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";

import { EASE_OUT } from "@/components/motion/motion-presets";

export type HoverLiftProps = HTMLMotionProps<"div"> & {
  /** Vertical travel in pixels. Kept small — this should read as depth, not motion. */
  distance?: number;
};

/** Raises its child slightly on hover and settles it on press. */
function HoverLift({ distance = 3, children, ...props }: HoverLiftProps) {
  return (
    <motion.div
      whileHover={{ y: -distance }}
      whileTap={{ y: 0 }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export { HoverLift };
