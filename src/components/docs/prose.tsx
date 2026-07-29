import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The inline syntax documentation prose is written in.
 *
 * Three constructs, because technical writing uses three: `code`, **bold**,
 * and [links](/docs/x). Anything richer is a block of its own rather than more
 * syntax to learn — a table is a table, not pipes inside a paragraph.
 */
const PATTERN = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;

export function Prose({ children, className }: { children: string; className?: string }) {
  return <span className={className}>{render(children)}</span>;
}

export function render(text: string): React.ReactNode[] {
  return text.split(PATTERN).filter(Boolean).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className="rounded-[4px] border border-border bg-surface-raised px-[0.3em] py-[0.1em] font-mono text-[0.86em] font-semibold text-foreground"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }

    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      // A docs link is written as the reader sees it — /docs/concepts/evidence
      // — but the docs host serves those at the root. Strip the prefix so the
      // same text is correct on either hostname.
      const target = href.startsWith("/docs/") ? href.slice("/docs".length) : href;
      const external = target.startsWith("http");

      return (
        <Link
          key={index}
          href={target}
          {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
          className="font-semibold text-primary underline decoration-primary/30 underline-offset-[3px] transition-colors hover:decoration-primary"
        >
          {label}
        </Link>
      );
    }

    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

export function Paragraph({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <p className={cn("text-[15px] leading-[1.75] font-medium text-muted", className)}>
      {render(children)}
    </p>
  );
}
