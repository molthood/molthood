"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/loading-state";
import { api } from "@/lib/api/client";
import type { ChainToken } from "@/lib/api/types";
import { formatCompact, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Find a token by ticker.
 *
 * The console assumed you already had a 42-character address, which is the
 * wrong way round — people see a ticker on social media and go looking. This
 * is the step that was missing between "I heard about $FOO" and being able to
 * analyse it at all.
 */
function TickerSearch({
  onPick,
  className,
}: {
  onPick: (token: ChainToken) => void;
  className?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<ChainToken[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    // Debounced: a keystroke per request would spend the rate limit on
    // prefixes nobody meant to search for.
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const found = await api.chainTokens(8, trimmed, controller.signal);
        setResults(found.items);
        setOpen(true);
      } catch {
        // A failed lookup leaves the address field usable, so there is
        // nothing here worth interrupting the user for.
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search by ticker — USDG, VIRTUAL, CASHDOG…"
          aria-label="Search tokens by ticker or name"
          autoComplete="off"
          spellCheck={false}
          className="pl-9"
        />
        {searching ? (
          <Spinner className="absolute top-1/2 right-3 size-4 -translate-y-1/2" />
        ) : null}
      </div>

      {open && results.length ? (
        <Card className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto p-1 shadow-lg">
          <ul>
            {results.map((token) => (
              <li key={token.address ?? token.symbol}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(token);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-surface-raised"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-bold text-foreground">
                      {token.symbol ?? "—"}
                    </span>
                    <span className="truncate text-xs font-medium text-muted">
                      {token.name ?? "—"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs font-bold text-foreground tabular-nums">
                      {formatUsd(token.price_usd)}
                    </span>
                    <span className="block text-[11px] font-medium text-muted tabular-nums">
                      {formatCompact(token.holders)} holders
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

export { TickerSearch };
