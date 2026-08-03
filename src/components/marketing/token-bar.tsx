"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { Container } from "@/components/layout/container";
import { TOKEN } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * The official contract address, at the top of the landing page.
 *
 * Shown **in full**, never shortened. A truncated address is the one thing an
 * impersonator can reproduce exactly — `0xd0a9…a491` matches a lookalike as
 * happily as it matches this one — so the middle is the only part that
 * actually distinguishes them, and hiding it defeats the point of publishing
 * it at all.
 *
 * Dark, to sit against the navbar directly above it rather than float on the
 * green surface as a second, competing band.
 */

function TokenBar({ className }: { className?: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(TOKEN.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // A refused clipboard permission is not worth an error state — the
      // address is on screen and can be selected by hand.
    }
  };

  return (
    <div
      className={cn(
        "molthood-dark bg-background border-border border-b",
        className,
      )}
    >
      <Container size="xl">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 py-2.5 sm:justify-start">
          <span className="text-primary font-mono text-[12px] font-bold tracking-wide">
            {TOKEN.symbol}
          </span>

          <code className="text-foreground min-w-0 font-mono text-[11px] break-all sm:text-[12px]">
            {TOKEN.address}
          </code>

          <button
            type="button"
            onClick={copy}
            aria-label={`Copy the ${TOKEN.symbol} contract address`}
            className="border-border-strong text-muted hover:text-foreground hover:border-border-strong inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold transition-colors"
          >
            {copied ? (
              <Check className="text-primary size-3" aria-hidden="true" />
            ) : (
              <Copy className="size-3" aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>

          <span className="text-muted font-mono text-[11px] font-medium">
            on {TOKEN.chain}
          </span>
        </div>
      </Container>
    </div>
  );
}

export { TokenBar };
