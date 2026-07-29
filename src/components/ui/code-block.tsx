"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

export type CodeBlockProps = {
  code: string;
  /** Shown in the header strip — a filename, language, or shell name. */
  label?: string;
  className?: string;
};

/** Monospaced snippet with a header strip and copy affordance. */
function CodeBlock({ code, label, className }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);
  const timeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(timeout.current), []);

  const onCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      clearTimeout(timeout.current);
      timeout.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be denied; the snippet is still selectable.
    }
  }, [code]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-card border border-border bg-surface",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="truncate font-mono text-[11px] font-bold tracking-wide text-muted">
          {label ?? "shell"}
        </span>
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? "Copied" : "Copy code"}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
        >
          {copied ? (
            <Check className="size-3.5 text-primary" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>
      <div className="overflow-x-auto">
        <pre className="p-4 text-[13px] leading-relaxed text-foreground">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

export { CodeBlock };
