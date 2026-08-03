"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The loader shown while Molthood Agent is working.
 *
 * It takes **no props**, and that is the whole design. The parent re-renders on
 * every streamed token; a component with no props wrapped in `React.memo` never
 * re-renders at all, so the `<video>` element is created once and the browser
 * keeps playing it. Passing so much as a label through here would re-render it
 * hundreds of times during a long answer.
 *
 * The element still has to survive reconciliation, which it does because
 * `ChatMessage` renders it from a fixed child slot rather than swapping it with
 * the answer body. Same type, same position, same DOM node — React updates
 * around it and playback is never interrupted.
 */

function ThinkingLoaderBase({ className }: { className?: string }) {
  const ref = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const video = ref.current;
    if (!video) return;

    // React does not reliably reflect `muted` onto the DOM node, and an
    // unmuted video is refused autoplay everywhere. Set it directly.
    video.muted = true;
    video.defaultMuted = true;

    // Autoplay can still be declined — a background tab, a data saver, reduced
    // motion. Ask once; a rejected promise here is not an error worth showing.
    void video.play().catch(() => {});
  }, []);

  return (
    <div
      className={cn("text-muted flex items-center gap-2.5 text-sm font-medium", className)}
      role="status"
      aria-live="polite"
    >
      {/*
        `screen` is what removes the black background without an alpha channel.
        H.264 has no alpha, but screen blending is exact where the source is
        black: 1-(1-0)(1-b) leaves the backdrop untouched, so only the mark and
        its glow are added. It also means this sits correctly over the ambient
        video behind the conversation rather than punching a dark square in it.
      */}
      <video
        ref={ref}
        src="/loader.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
        className="block size-6 shrink-0 bg-transparent object-contain [mix-blend-mode:screen]"
      />
      Thinking through your request&hellip;
    </div>
  );
}

/**
 * Never re-renders: no props means the memo comparison always passes.
 */
const ThinkingLoader = React.memo(ThinkingLoaderBase);
ThinkingLoader.displayName = "ThinkingLoader";

export { ThinkingLoader };
