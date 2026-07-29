"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type SearchInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  /** Shown on the right — typically a `Kbd` shortcut hint. */
  trailing?: React.ReactNode;
  onClear?: () => void;
};

/** Text input with a leading search icon and an optional clear affordance. */
function SearchInput({
  className,
  trailing,
  onClear,
  value,
  ...props
}: SearchInputProps) {
  const hasValue = typeof value === "string" && value.length > 0;

  return (
    <div
      className={cn(
        "group relative flex h-10 w-full items-center rounded-lg border border-border bg-surface",
        "transition-colors duration-150 hover:border-border-strong focus-within:border-foreground",
        className,
      )}
    >
      <Search
        className="pointer-events-none absolute left-3 size-4 text-muted"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        className={cn(
          "h-full w-full bg-transparent pl-9 text-sm font-medium text-foreground outline-none",
          "placeholder:font-normal placeholder:text-muted/70",
          "[&::-webkit-search-cancel-button]:appearance-none",
          hasValue && onClear ? "pr-9" : trailing ? "pr-16" : "pr-3",
        )}
        {...props}
      />

      {hasValue && onClear ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-2 inline-flex size-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      ) : trailing ? (
        <span className="pointer-events-none absolute right-2.5 flex items-center gap-1">
          {trailing}
        </span>
      ) : null}
    </div>
  );
}

export { SearchInput };
