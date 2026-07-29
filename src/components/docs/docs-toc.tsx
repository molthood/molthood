"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * "On this page", with the current section highlighted.
 *
 * Tracked with an IntersectionObserver rather than a scroll handler: the
 * browser does the work off the main thread, and a scroll listener firing on
 * every frame is the classic way a documentation page starts to feel heavy.
 */
export function DocsToc({
  headings,
  className,
}: {
  headings: { id: string; content: string }[];
  className?: string;
}) {
  const [active, setActive] = React.useState<string | null>(headings[0]?.id ?? null);

  React.useEffect(() => {
    if (!headings.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // Top-weighted: a heading counts as current once it reaches the upper
      // third, which is where a reader's eye actually is.
      { rootMargin: "-80px 0px -66% 0px", threshold: 0 },
    );

    for (const heading of headings) {
      const element = document.getElementById(heading.id);
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) return null;

  return (
    <nav className={cn("flex flex-col gap-2", className)} aria-label="On this page">
      <p className="text-[11px] font-bold tracking-[0.1em] text-muted uppercase">
        On this page
      </p>
      <ul className="flex flex-col">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              className={cn(
                "-ml-px block border-l py-1.5 pl-3 text-[13px] leading-snug font-medium transition-colors",
                active === heading.id
                  ? "border-primary font-bold text-foreground"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground",
              )}
            >
              {heading.content}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
