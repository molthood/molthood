"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

import { EASE_OUT, viewportOnce } from "@/components/motion/motion-presets";
import { pipelineStages, type PipelineStage } from "@/config/pipeline";
import { cn } from "@/lib/utils";

const STAGE_DELAY = 0.14;

function StageIcon({ stage, index }: { stage: PipelineStage; index: number }) {
  const Icon = stage.icon;

  return (
    <motion.span
      variants={{
        hidden: { opacity: 0, scale: 0.9 },
        visible: {
          opacity: 1,
          scale: 1,
          transition: { duration: 0.45, ease: EASE_OUT, delay: index * STAGE_DELAY },
        },
      }}
      className={cn(
        "relative z-10 flex size-13 shrink-0 items-center justify-center rounded-xl",
        "border border-border bg-surface text-primary",
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </motion.span>
  );
}

function StageLabel({ stage, index }: { stage: PipelineStage; index: number }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 8 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.45,
            ease: EASE_OUT,
            delay: index * STAGE_DELAY + 0.08,
          },
        },
      }}
    >
      <p className="font-mono text-[11px] font-bold tracking-[0.14em] text-muted uppercase">
        {String(index + 1).padStart(2, "0")}
      </p>
      <h3 className="mt-2 font-display text-[15px] leading-snug font-bold text-foreground">
        {stage.label}
      </h3>
      <p className="mt-2 text-sm leading-relaxed font-medium text-muted">
        {stage.description}
      </p>
    </motion.div>
  );
}

/** The rail that connects stages, plus the sweep that draws it in on scroll. */
function Rail({ orientation }: { orientation: "horizontal" | "vertical" }) {
  const reduceMotion = useReducedMotion();
  const horizontal = orientation === "horizontal";
  const drawDuration = pipelineStages.length * STAGE_DELAY + 0.5;

  return (
    <>
      <div
        aria-hidden="true"
        className={cn(
          "absolute bg-border",
          horizontal ? "top-6.5 right-[10%] left-[10%] h-px" : "top-6.5 bottom-6.5 left-6.5 w-px",
        )}
      />
      <motion.div
        aria-hidden="true"
        variants={{
          hidden: horizontal ? { scaleX: 0 } : { scaleY: 0 },
          visible: {
            scaleX: 1,
            scaleY: 1,
            transition: { duration: drawDuration, ease: EASE_OUT },
          },
        }}
        style={{ transformOrigin: horizontal ? "left center" : "center top" }}
        className={cn(
          "absolute bg-foreground",
          horizontal ? "top-6.5 right-[10%] left-[10%] h-px" : "top-6.5 bottom-6.5 left-6.5 w-px",
        )}
      />

      {/* A single slow packet travelling the rail — the only looping motion on the page. */}
      {reduceMotion ? null : (
        <motion.span
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={
            horizontal
              ? { left: ["10%", "90%"], opacity: [0, 1, 1, 0] }
              : { top: ["1.625rem", "calc(100% - 1.625rem)"], opacity: [0, 1, 1, 0] }
          }
          transition={{
            duration: 3.2,
            ease: "linear",
            repeat: Infinity,
            repeatDelay: 1.6,
            times: [0, 0.12, 0.88, 1],
          }}
          className={cn(
            "absolute z-0 size-2 rounded-full bg-foreground",
            "shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-foreground)_14%,transparent)]",
            horizontal ? "top-6.5 -mt-1 -ml-1" : "left-6.5 -mt-1 -ml-1",
          )}
        />
      )}
    </>
  );
}

function Pipeline() {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      className="relative"
    >
      {/* Desktop — stages laid out along a horizontal rail. */}
      <div className="relative hidden lg:block">
        <Rail orientation="horizontal" />
        <ol className="relative grid grid-cols-5">
          {pipelineStages.map((stage, index) => (
            <li key={stage.id} className="flex flex-col items-center px-4 text-center">
              <StageIcon stage={stage} index={index} />
              <div className="mt-5">
                <StageLabel stage={stage} index={index} />
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Mobile & tablet — the same rail, rotated. */}
      <div className="relative lg:hidden">
        <Rail orientation="vertical" />
        <ol className="relative flex flex-col gap-6">
          {pipelineStages.map((stage, index) => (
            <li key={stage.id} className="flex items-start gap-5">
              <StageIcon stage={stage} index={index} />
              <div className="pt-0.5">
                <StageLabel stage={stage} index={index} />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </motion.div>
  );
}

export { Pipeline };
