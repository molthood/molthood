"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import {
  formatContext,
  type ModelBadge,
  type ModelOption,
  type ModelProvider,
} from "@/lib/ai/models";
import { cn } from "@/lib/utils";

/**
 * Provider marks.
 *
 * Drawn as SVG rather than fetched: a strict content policy blocks remote
 * images, an icon that fails to load leaves a hole in the row, and four small
 * glyphs are far cheaper inline than four network requests. Each is a simple
 * geometric reading of the provider's mark, in `currentColor` so it inherits
 * the row's state instead of carrying its own palette.
 */
function ProviderMark({ provider }: { provider: ModelProvider }) {
  const common = {
    viewBox: "0 0 24 24",
    className: "size-4 shrink-0",
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

/**
 * Badge colours.
 *
 * Only the primary capability takes the accent. If every badge were green the
 * row would carry no ranking at all, and ranking is what a badge is for.
 */
const BADGE_STYLES: Record<ModelBadge, string> = {
  Reasoning: "border-primary/40 text-primary",
  Research: "border-primary/40 text-primary",
  Coding: "border-border-strong text-foreground",
  Fast: "border-border-strong text-foreground",
  Premium: "border-border-strong text-muted",
  "Long context": "border-border-strong text-muted",
};

function Badge({ badge }: { badge: ModelBadge }) {
  return (
    <span
      className={cn(
        "rounded-full border px-1.5 py-px text-[10px] font-bold whitespace-nowrap",
        BADGE_STYLES[badge],
      )}
    >
      {badge}
    </span>
  );
}

export type ModelPickerProps = {
  models: ModelOption[];
  value: string;
  onChange: (id: string) => void;
  /** Locked mid-answer: the request already named a model. */
  disabled?: boolean;
  className?: string;
};

function ModelPicker({
  models,
  value,
  onChange,
  disabled = false,
  className,
}: ModelPickerProps) {
  const selected = models.find((model) => model.id === value);

  return (
    <Dropdown>
      <DropdownTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "text-muted hover:text-foreground hover:border-border-strong border-border",
            "inline-flex h-8 max-w-[70vw] items-center gap-1.5 rounded-lg border px-2.5",
            "text-[12px] font-bold transition-colors disabled:opacity-50",
            className,
          )}
          aria-label="Choose model"
        >
          {selected ? <ProviderMark provider={selected.provider} /> : null}
          <span className="truncate">{selected?.label ?? value}</span>
          <ChevronDown className="size-3 shrink-0 opacity-70" aria-hidden="true" />
        </button>
      </DropdownTrigger>

      <DropdownContent align="start" className="w-[min(23rem,92vw)]">
        <DropdownLabel>Model</DropdownLabel>
        {models.map((model) => {
          const active = model.id === value;

          return (
            // Only answerable models reach this list. A route that cannot
            // serve is resolved away server-side, so there is nothing here to
            // disable — and no entry that fails the moment it is chosen.
            <DropdownItem
              key={model.id}
              onSelect={() => onChange(model.id)}
              className="items-start gap-2.5 py-2.5"
            >
              <Check
                className={cn(
                  "text-primary mt-0.5 size-3.5 shrink-0",
                  active ? "opacity-100" : "opacity-0",
                )}
                aria-hidden="true"
              />

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <ProviderMark provider={model.provider} />
                  <span className="text-foreground text-[13px] font-bold">
                    {model.label}
                  </span>
                  {model.badges.map((badge) => (
                    <Badge key={badge} badge={badge} />
                  ))}
                </span>

                <span className="text-muted mt-0.5 block text-[11px] leading-snug font-medium">
                  {model.description}
                </span>

                <span className="text-muted mt-1 block font-mono text-[10px] font-bold tracking-wide">
                  {formatContext(model.contextTokens)}
                </span>
              </span>
            </DropdownItem>
          );
        })}
      </DropdownContent>
    </Dropdown>
  );
}

export { ModelPicker };
