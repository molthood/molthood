"use client";

import * as React from "react";
import { Check, ChevronDown, Eye, Paperclip, Sparkles, Wrench, Zap } from "lucide-react";

import { PROVIDER_LABELS, ProviderLogo } from "@/components/ai/provider-logo";

import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { formatContext, type ModelBadge, type ModelOption } from "@/lib/ai/models";
import { cn } from "@/lib/utils";

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

/**
 * What the model supports, as icons rather than a sentence.
 *
 * Only what is true is shown. An icon rendered in a "disabled" state still
 * reads as a feature at a glance, and the row is scanned rather than studied.
 */
function Skills({ skills }: { skills: ModelOption["skills"] }) {
  const entries = [
    { on: skills.streaming, icon: Zap, label: "Streaming" },
    { on: skills.tools, icon: Wrench, label: "Tool calling" },
    { on: skills.reasoning, icon: Sparkles, label: "Reasoning" },
    { on: skills.vision, icon: Eye, label: "Vision" },
    { on: skills.files, icon: Paperclip, label: "Files" },
  ].filter((entry) => entry.on);

  return (
    <span className="flex items-center gap-1.5">
      {entries.map(({ icon: Icon, label }) => (
        <span key={label} title={label} className="text-muted inline-flex">
          <Icon className="size-3" aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </span>
      ))}
    </span>
  );
}

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
          {selected ? <ProviderLogo provider={selected.provider} size={16} /> : null}
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
                  <ProviderLogo provider={model.provider} size={16} />
                  <span className="text-foreground text-[13px] font-bold">
                    {model.label}
                  </span>
                  {model.badges.map((badge) => (
                    <Badge key={badge} badge={badge} />
                  ))}
                </span>

                <span className="text-muted mt-0.5 block text-[11px] font-bold">
                  {PROVIDER_LABELS[model.provider]}
                </span>
                <span className="text-foreground/80 mt-1 block text-[11px] leading-snug font-medium">
                  {model.bestFor}
                </span>
                <span className="text-muted mt-0.5 block text-[11px] leading-snug font-medium">
                  {model.description}
                </span>

                <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="text-muted font-mono text-[10px] font-bold tracking-wide">
                    {formatContext(model.contextTokens)}
                  </span>
                  <Skills skills={model.skills} />
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
