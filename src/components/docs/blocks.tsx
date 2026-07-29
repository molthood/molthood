import * as React from "react";
import { AlertTriangle, Info, OctagonAlert } from "lucide-react";

import { Paragraph, render } from "@/components/docs/prose";
import { CodeBlock } from "@/components/ui/code-block";
import type { Block } from "@/config/docs";
import { cn } from "@/lib/utils";

const CALLOUT = {
  note: {
    icon: Info,
    wrapper: "border-primary/25 bg-primary/[0.06]",
    icon_class: "text-primary",
  },
  warning: {
    icon: AlertTriangle,
    wrapper: "border-warning/30 bg-warning/[0.07]",
    icon_class: "text-warning",
  },
  danger: {
    icon: OctagonAlert,
    wrapper: "border-danger/30 bg-danger/[0.06]",
    icon_class: "text-danger",
  },
} as const;

const METHOD_TONE: Record<string, string> = {
  GET: "border-primary/30 bg-primary/10 text-primary",
  POST: "border-[#12490F]/30 bg-[#12490F]/10 text-[#12490F]",
  DELETE: "border-danger/30 bg-danger/10 text-danger",
};

const AUTH_LABEL: Record<string, string> = {
  required: "API key",
  admin: "Admin key",
  none: "No auth",
};

/** One content block. Every branch is exhaustive over `Block`. */
function DocBlock({ block }: { block: Block }) {
  switch (block.kind) {
    case "text":
      return <Paragraph>{block.content}</Paragraph>;

    case "heading":
      return (
        <h2
          id={block.id}
          className="scroll-mt-28 pt-6 font-display text-[19px] font-bold tracking-[-0.01em] text-foreground"
        >
          {/* The anchor is the heading itself: a hover-only link icon is
              invisible on touch, where deep links get shared most. */}
          <a href={`#${block.id}`} className="hover:text-primary">
            {block.content}
          </a>
        </h2>
      );

    case "code":
      return <CodeBlock code={block.content} label={block.label} />;

    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List
          className={cn(
            "flex flex-col gap-2 pl-5 text-[15px] leading-[1.7] font-medium text-muted",
            block.ordered ? "list-decimal" : "list-disc",
          )}
        >
          {block.items.map((item, index) => (
            <li key={index} className="pl-1 marker:text-border-strong">
              {render(item)}
            </li>
          ))}
        </List>
      );
    }

    case "definitions":
      return (
        <dl className="flex flex-col gap-3">
          {block.items.map((item) => (
            <div
              key={item.term}
              className="rounded-lg border border-border bg-surface-raised px-4 py-3"
            >
              <dt className="font-mono text-[12.5px] font-bold text-foreground">
                {render(item.term)}
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed font-medium text-muted">
                {render(item.description)}
              </dd>
            </div>
          ))}
        </dl>
      );

    case "callout": {
      const tone = CALLOUT[block.tone];
      const Icon = tone.icon;
      return (
        <aside className={cn("flex gap-3 rounded-card border px-4 py-3.5", tone.wrapper)}>
          <Icon className={cn("mt-0.5 size-4 shrink-0", tone.icon_class)} aria-hidden="true" />
          <div className="min-w-0">
            {block.title ? (
              <p className="text-sm font-bold text-foreground">{block.title}</p>
            ) : null}
            <p
              className={cn(
                "text-sm leading-relaxed font-medium text-muted",
                block.title && "mt-1",
              )}
            >
              {render(block.content)}
            </p>
          </div>
        </aside>
      );
    }

    case "table":
      // Its own scroll container: a wide table must never make the page
      // scroll sideways on a phone.
      return (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-raised">
                {block.head.map((cell) => (
                  <th
                    key={cell}
                    className="px-4 py-2.5 text-[11px] font-bold tracking-wide text-muted uppercase"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, index) => (
                <tr key={index} className="border-b border-border last:border-0">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={cn(
                        "px-4 py-2.5 align-top leading-relaxed font-medium",
                        cellIndex === 0 ? "text-foreground" : "text-muted",
                      )}
                    >
                      {render(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "endpoint":
      return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border bg-surface-raised px-4 py-3">
          <span
            className={cn(
              "rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold",
              METHOD_TONE[block.method],
            )}
          >
            {block.method}
          </span>
          <code className="font-mono text-[13px] font-bold break-all text-foreground">
            {block.path}
          </code>
          <span className="ml-auto shrink-0 rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted">
            {AUTH_LABEL[block.auth]}
          </span>
          <p className="w-full text-sm font-medium text-muted">{render(block.summary)}</p>
        </div>
      );
  }
}

export function DocBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-5">
      {blocks.map((block, index) => (
        <DocBlock key={index} block={block} />
      ))}
    </div>
  );
}
