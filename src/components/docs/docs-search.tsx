"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { searchIndex, type SearchEntry } from "@/config/docs";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

/**
 * Search across every page, in the browser.
 *
 * The index is built at module scope from the same content the pages render,
 * so it cannot go stale — and it is small enough that shipping it beats a
 * network round trip per keystroke.
 */
function score(entry: SearchEntry, terms: string[]): number {
  let total = 0;
  const title = entry.title.toLowerCase();

  for (const term of terms) {
    if (!entry.haystack.includes(term)) return 0;
    // A title match is what the reader almost always meant.
    if (title.includes(term)) total += 10;
    if (entry.description.toLowerCase().includes(term)) total += 4;
    total += 1;
  }
  return total;
}

export function DocsSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const results = React.useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return searchIndex
      .map((entry) => ({ entry, weight: score(entry, terms) }))
      .filter((item) => item.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8)
      .map((item) => item.entry);
  }, [query]);

  // "/" focuses search, the convention every docs site shares.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  React.useEffect(() => setHighlighted(0), [query]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 transition-colors focus-within:border-border-strong">
        <Search className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Search the docs"
          aria-label="Search the documentation"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
              return;
            }
            if (!results.length) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlighted((value) => (value + 1) % results.length);
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlighted((value) => (value - 1 + results.length) % results.length);
            }
            if (event.key === "Enter") {
              event.preventDefault();
              const target = results[highlighted];
              if (target) {
                router.push(target.href);
                setOpen(false);
                setQuery("");
                inputRef.current?.blur();
              }
            }
          }}
          className="w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        />
        <Kbd className="hidden sm:inline-flex">/</Kbd>
      </div>

      {open && query.trim() ? (
        <div className="absolute top-full right-0 left-0 z-40 mt-2 overflow-hidden rounded-card border border-border-strong bg-surface shadow-xl">
          {results.length ? (
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {results.map((entry, index) => (
                <li key={entry.href}>
                  <Link
                    href={entry.href}
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                    }}
                    onMouseEnter={() => setHighlighted(index)}
                    className={cn(
                      "block px-3.5 py-2.5",
                      index === highlighted && "bg-surface-raised",
                    )}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="text-sm font-bold text-foreground">
                        {entry.title}
                      </span>
                      <span className="font-mono text-[10px] font-bold text-muted">
                        {entry.category}
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed font-medium text-muted">
                      {entry.description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3.5 py-4 text-sm font-medium text-muted">
              Nothing matches “{query}”.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
