"use client";

import * as React from "react";
import Image from "next/image";

import type { ModelProvider } from "@/lib/ai/models";
import { cn } from "@/lib/utils";

/**
 * The provider's mark, at one size everywhere.
 *
 * Two sources, in order. The file under `/public` is used, and a drawn glyph
 * takes over if it ever fails to load.
 *
 * The fallback is not a placeholder to be removed later. It is what keeps a
 * model row from rendering a broken-image icon if an asset is renamed or lost
 * — which is a live risk, since these filenames changed once already between
 * being specified and being added.
 */

const FILES: Record<ModelProvider, string> = {
  anthropic: "/anthropic.jpg",
  openai: "/chatgpt.jpg",
  google: "/gemini.jpg",
  deepseek: "/deepseek.jpg",
};

const LABELS: Record<ModelProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  deepseek: "DeepSeek",
};

/** Geometric readings of each mark, in `currentColor` so they follow the row. */
function DrawnMark({ provider, size }: { provider: ModelProvider; size: number }) {
  const common = {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    className: "shrink-0",
    "aria-hidden": true as const,
  };

  switch (provider) {
    case "anthropic":
      return (
        <svg {...common} fill="currentColor">
          <path d="M7.4 4h3.05l5.4 16h-3.2l-1.1-3.4H5.9L4.8 20H1.6L7.4 4Zm.53 4.2-1.5 4.8h3.06l-1.5-4.8Z" />
          <path d="M16.6 4H20l-4.2 12.6-1.6-4.9L16.6 4Z" opacity="0.55" />
        </svg>
      );
    case "openai":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M12 3.2 18.4 7v7.9L12 18.8 5.6 14.9V7L12 3.2Z" strokeLinejoin="round" />
          <path d="M12 3.2v7.7l6.4 4M12 10.9l-6.4 4" strokeLinejoin="round" />
        </svg>
      );
    case "google":
      return (
        <svg {...common} fill="currentColor">
          <path d="M12 2c.4 4.6 3.4 7.6 8 8-4.6.4-7.6 3.4-8 8-.4-4.6-3.4-7.6-8-8 4.6-.4 7.6-3.4 8-8Z" />
        </svg>
      );
    case "deepseek":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="12" cy="12" r="8.2" />
          <path d="M12 3.8c3 2.4 3 13.9 0 16.4M3.9 12h16.2" strokeLinecap="round" />
        </svg>
      );
  }
}

export type ProviderLogoProps = {
  provider: ModelProvider;
  /** Rendered size in CSS pixels. One value drives both sources. */
  size?: number;
  className?: string;
};

function ProviderLogo({ provider, size = 16, className }: ProviderLogoProps) {
  const [useDrawn, setUseDrawn] = React.useState(false);

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      title={LABELS[provider]}
    >
      {useDrawn ? (
        <DrawnMark provider={provider} size={size} />
      ) : (
        <Image
          src={FILES[provider]}
          alt=""
          width={size * 2}
          height={size * 2}
          // Never above the fold in a way that matters — these sit in a menu
          // that opens on demand and beside messages further down the page.
          loading="lazy"
          onError={() => setUseDrawn(true)}
          // Rounded because the supplied marks are square tiles with their own
          // backgrounds; square-on-dark reads as an unstyled attachment.
          className="size-full rounded-[4px] object-cover"
          aria-hidden="true"
        />
      )}
    </span>
  );
}

export { ProviderLogo, LABELS as PROVIDER_LABELS };
