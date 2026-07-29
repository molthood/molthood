import type { Transition, Variants } from "framer-motion";

/**
 * Shared motion language. Everything is short, eased-out and low-amplitude —
 * motion should register as polish, never as an effect.
 */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const baseTransition: Transition = {
  duration: 0.55,
  ease: EASE_OUT,
};

/** Viewport config so sections animate once, slightly before they are centred. */
export const viewportOnce = { once: true, amount: 0.25, margin: "0px 0px -80px 0px" };

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: baseTransition },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: baseTransition },
};

export const fadeBlur: Variants = {
  hidden: { opacity: 0, y: 10, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { ...baseTransition, duration: 0.7 },
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: baseTransition },
};

export const slideRight: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: baseTransition },
};

/** Parent variant that releases children one after another. */
export function staggerContainer(stagger = 0.07, delayChildren = 0): Variants {
  return {
    hidden: {},
    visible: {
      transition: { staggerChildren: stagger, delayChildren },
    },
  };
}

export const motionPresets = {
  fadeUp,
  fadeIn,
  fadeBlur,
  scaleIn,
  slideRight,
} as const;

export type MotionPreset = keyof typeof motionPresets;
