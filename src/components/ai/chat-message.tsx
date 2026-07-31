"use client";

import * as React from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  RefreshCw,
} from "lucide-react";

import {
  Actions,
  Cards,
  ConfidenceBadge,
  Sources,
  Timeline,
  ToolBadges,
} from "@/components/ai/analysis";
import { Markdown } from "@/components/ai/markdown";
import { LogoMark } from "@/components/brand/logo";
import type { Message } from "@/hooks/use-molt-chat";

export type ChatMessageProps = {
  message: Message;
  /** The last assistant turn gets the regenerate control. */
  isLast: boolean;
  streaming: boolean;
  onRegenerate: () => void;
  /** Sends a suggested follow-up straight away. */
  onAction: (prompt: string) => void;
};

function ChatMessage({
  message,
  isLast,
  streaming,
  onRegenerate,
  onAction,
}: ChatMessageProps) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Refused clipboard permission is not worth an error state.
    }
  };

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="border-border bg-surface max-w-[85%] rounded-2xl rounded-br-md border px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap sm:max-w-[75%]">
          {message.content}
        </div>
      </div>
    );
  }

  const empty = message.content.length === 0;

  return (
    <div className="flex gap-3">
      <LogoMark size={26} className="mt-0.5 hidden sm:block" />

      <div className="min-w-0 flex-1">
        <Timeline steps={message.steps ?? []} />
        <ToolBadges badges={message.badges ?? []} />
        <Cards cards={message.cards ?? []} />

        {empty && !message.error ? (
          <div className="text-muted flex items-center gap-2 text-sm font-medium">
            <Loader2 className="size-3.5 animate-spin" />
            Thinking…
          </div>
        ) : (
          <Markdown content={message.content} />
        )}

        {message.error ? (
          <div className="border-danger/40 bg-danger/10 mt-2 rounded-xl border px-3.5 py-3">
            <p className="text-foreground flex items-start gap-2 text-sm font-semibold">
              <AlertTriangle className="text-danger mt-0.5 size-4 shrink-0" />
              {message.error}
            </p>
            <button
              type="button"
              onClick={onRegenerate}
              className="border-border hover:border-border-strong text-foreground mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition-colors"
            >
              <RefreshCw className="size-3.5" />
              Try again
            </button>
          </div>
        ) : null}

        {message.confidence && !streaming ? (
          <ConfidenceBadge confidence={message.confidence} />
        ) : null}

        {!streaming ? <Sources sources={message.sources ?? []} /> : null}

        {!streaming && !empty && !message.error ? (
          <div className="mt-2 flex items-center gap-1">
            <button
              type="button"
              onClick={copy}
              aria-label={copied ? "Copied" : "Copy response"}
              className="text-muted hover:text-foreground hover:bg-surface inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold transition-colors"
            >
              {copied ? (
                <Check className="text-primary size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>

            {isLast ? (
              <button
                type="button"
                onClick={onRegenerate}
                className="text-muted hover:text-foreground hover:bg-surface inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold transition-colors"
              >
                <RefreshCw className="size-3.5" />
                Regenerate
              </button>
            ) : null}
          </div>
        ) : null}

        {!streaming && !message.error ? (
          <Actions actions={message.actions ?? []} onPick={onAction} />
        ) : null}
      </div>
    </div>
  );
}

export { ChatMessage };
