"use client";

import * as React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";

import {
  motionPresets,
  staggerContainer,
  viewportOnce,
  type MotionPreset,
} from "@/components/motion/motion-presets";
import { cn } from "@/lib/utils";

export type RevealProps = Omit<HTMLMotionProps<"div">, "variants"> & {
  preset?: MotionPreset;
  delay?: number;
  /** Animate as soon as it mounts instead of waiting for the viewport. */
  immediate?: boolean;
};

/** Animates its children in once, the first time they enter the viewport. */
function Reveal({
  preset = "fadeUp",
  delay = 0,
  immediate = false,
  className,
  children,
  ...props
}: RevealProps) {
  const animationProps = immediate
    ? { animate: "visible" as const }
    : { whileInView: "visible" as const, viewport: viewportOnce };

  return (
    <motion.div
      initial="hidden"
      variants={motionPresets[preset]}
      transition={{ delay }}
      className={cn(className)}
      {...animationProps}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export type StaggerProps = Omit<HTMLMotionProps<"div">, "variants"> & {
  stagger?: number;
  delayChildren?: number;
  immediate?: boolean;
};

/** Wraps a list so each `RevealItem` inside animates in sequence. */
function Stagger({
  stagger = 0.07,
  delayChildren = 0,
  immediate = false,
  className,
  children,
  ...props
}: StaggerProps) {
  const animationProps = immediate
    ? { animate: "visible" as const }
    : { whileInView: "visible" as const, viewport: viewportOnce };

  return (
    <motion.div
      initial="hidden"
      variants={staggerContainer(stagger, delayChildren)}
      className={cn(className)}
      {...animationProps}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export type RevealItemProps = Omit<HTMLMotionProps<"div">, "variants"> & {
  preset?: MotionPreset;
};

/** A single child of `Stagger`. Inherits the parent's orchestration. */
function RevealItem({
  preset = "fadeUp",
  className,
  children,
  ...props
}: RevealItemProps) {
  return (
    <motion.div variants={motionPresets[preset]} className={cn(className)} {...props}>
      {children}
    </motion.div>
  );
}

export { Reveal, Stagger, RevealItem };
