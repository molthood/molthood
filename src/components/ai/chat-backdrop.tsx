"use client";

import * as React from "react";

/**
 * The ambient backdrop behind the Molthood Agent conversation.
 *
 * Three layers, in this order: the video, a flat scrim that sets a floor on
 * contrast, and a radial scrim that is *darkest in the middle*. The last one
 * is deliberately the opposite of a vignette — the messages run down the centre
 * column, so that is the strip that has to stay quietest.
 *
 * Nothing here is decoration for its own sake. The constraint that shaped every
 * choice below is that a moving image behind text is a contrast hazard, and the
 * only acceptable version is one you stop noticing within a second.
 */

const SOURCES = { mobile: "/hero-mobile.mp4", desktop: "/hero-desktop.mp4" };

/** Matches the `md` breakpoint the rest of the interface uses. */
const DESKTOP = "(min-width: 768px)";
const REDUCED = "(prefers-reduced-motion: reduce)";

function ChatBackdrop() {
  // `null` until the browser has been asked. Rendering a guess on the server
  // would either hydrate to a mismatch or download the wrong file first — and
  // the requirement is that exactly one video is ever fetched.
  const [source, setSource] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const reduced = window.matchMedia(REDUCED);
    const desktop = window.matchMedia(DESKTOP);

    const resolve = () => {
      // Reduced motion disables the video outright rather than slowing it. The
      // static background underneath is the whole design already, so there is
      // nothing to degrade to.
      if (reduced.matches) {
        setSource(null);
        return;
      }
      // Keyed on the boolean, not the width. A resize that does not cross the
      // breakpoint leaves this unchanged, so the element is never re-created
      // and playback never restarts.
      setSource(desktop.matches ? SOURCES.desktop : SOURCES.mobile);
    };

    resolve();
    reduced.addEventListener("change", resolve);
    desktop.addEventListener("change", resolve);

    return () => {
      reduced.removeEventListener("change", resolve);
      desktop.removeEventListener("change", resolve);
    };
  }, []);

  // A hidden tab decoding video is spending a phone's battery on nothing.
  React.useEffect(() => {
    const onVisibility = () => {
      const video = videoRef.current;
      if (!video) return;
      if (document.hidden) video.pause();
      else void video.play().catch(() => {});
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Fade back out while a new source loads, so a switch never shows a raw
  // first frame or an empty black box mid-crossfade.
  React.useEffect(() => {
    setReady(false);
  }, [source]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {source ? (
        <video
          // Keyed so a breakpoint change swaps the element cleanly instead of
          // mutating `src` on a playing video, which stalls in some browsers.
          key={source}
          ref={videoRef}
          src={source}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onLoadedData={() => setReady(true)}
          // A missing or unplayable file drops the element rather than leaving
          // an invisible one in the tree retrying. Worth being explicit about:
          // a range request for an absent file returns 206 with the HTML 404
          // page inside it, so "the request succeeded" is not evidence that a
          // video arrived.
          onError={() => setSource(null)}
          className="absolute inset-0 size-full object-cover opacity-[0.55] transition-opacity duration-700 ease-out will-change-[opacity]"
          style={{
            opacity: ready ? undefined : 0,
            // Promotes the video to its own compositor layer, so its frames
            // never trigger layout or paint on the conversation above it.
            transform: "translateZ(0)",
          }}
        />
      ) : null}

      {/* Contrast floor. Applied whether or not a video is playing, so the
          surface looks identical before the asset loads and under reduced
          motion — there is no "unstyled" state to flash through. */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Darkest through the middle, where the messages are. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 62% 72% at 50% 48%, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.55) 48%, rgba(0,0,0,0.12) 100%)",
        }}
      />
    </div>
  );
}

export { ChatBackdrop };
