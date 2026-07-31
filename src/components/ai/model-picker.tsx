"use client";

import * as React from "react";
import { Check, ChevronDown, Cpu } from "lucide-react";

import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import type { ModelBadge, ModelOption } from "@/lib/ai/models";
import { cn } from "@/lib/utils";

/**
 * Badge colours.
 *
 * Only one badge is the accent. If every label were green the row would carry
 * no ranking at all, and the point of a badge is that it separates one model
 * from the rest.
 */
const BADGE_STYLES: Record<ModelBadge, string> = {
  "Best Reasoning": "border-primary/40 text-primary",
  Fast: "border-border-strong text-foreground",
  Coding: "border-border-strong text-muted",
  "Long Context": "border-border-strong text-muted",
  Premium: "border-border-strong text-muted",
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
            "inline-flex h-8 max-w-[60vw] items-center gap-1.5 rounded-lg border px-2.5",
            "text-[12px] font-bold transition-colors disabled:opacity-50",
            className,
          )}
          aria-label="Choose model"
        >
          <Cpu className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{selected?.label ?? value}</span>
          <ChevronDown className="size-3 shrink-0 opacity-70" aria-hidden="true" />
        </button>
      </DropdownTrigger>

      <DropdownContent align="start" className="w-[min(21rem,90vw)]">
        <DropdownLabel>Model</DropdownLabel>
        {models.map((model) => (
          <DropdownItem
            key={model.id}
            onSelect={() => onChange(model.id)}
            className="items-start gap-2.5 py-2.5"
          >
            <Check
              className={cn(
                "text-primary mt-0.5 size-3.5 shrink-0",
                model.id === value ? "opacity-100" : "opacity-0",
              )}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
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
            </span>
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}

export { ModelPicker };
