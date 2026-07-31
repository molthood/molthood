"use client";

import * as React from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  MinusCircle,
  RefreshCw,
} from "lucide-react";

import { Markdown } from "@/components/ai/markdown";
import { LogoMark } from "@/components/brand/logo";
import type { Message, ToolEvent } from "@/hooks/use-molt-chat";

/** Why a tool could not run, in words rather than a code. */
const REASONS: Record<string, string> = {
  missing_key: "not configured on this deployment",
  rate_limited: "the shared daily analysis allowance is spent",
  unreachable: "the API could not be reached",
  http_error: "the API returned an error",
  not_found: "nothing found for that subject",
  timeout: "took too long to finish",
};

function ToolRow({ tool }: { tool: ToolEvent }) {
  const icon =
    tool.status === "running" ? (
      <Loader2 className="text-muted size-3.5 shrink-0 animate-spin" />
    ) : tool.status === "ok" ? (
      <Check className="text-primary size-3.5 shrink-0" />
    ) : (
      <MinusCircle className="text-muted size-3.5 shrink-0" />
    );

  return (
    <li className="flex items-center gap-2 text-xs font-medium">
      {icon}
      <span className={tool.status === "unavailable" ? "text-muted" : "text-foreground"}>
        {tool.label}
      </span>
      {/* An unavailable check is stated, never omitted. A tool that silently
          vanished from this list would read as a check that passed. */}
      {tool.status === "unavailable" ? (
        <span className="text-muted">— could not run: {REASONS[tool.reason ?? ""] ?? "unavailable"}</span>
      ) : null}
    </li>
  );
}

export type ChatMessageProps = {
  message: Message;
  /** The last assistant turn gets the regenerate control. */
  isLast: boolean;
  streaming: boolean;
  onRegenerate: () => void;
};

function ChatMessage({ message, isLast, streaming, onRegenerate }: ChatMessageProps) {
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
        {message.tools && message.tools.length > 0 ? (
          <ul className="border-border bg-surface/60 mb-3 flex flex-col gap-1.5 rounded-xl border px-3 py-2.5">
            {message.tools.map((tool, index) => (
              <ToolRow key={`${tool.name}-${index}`} tool={tool} />
            ))}
          </ul>
        ) : null}

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
      </div>
    </div>
  );
}

export { ChatMessage };
