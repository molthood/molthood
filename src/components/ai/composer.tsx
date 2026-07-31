"use client";

import * as React from "react";
import { ArrowUp, Square } from "lucide-react";

import { cn } from "@/lib/utils";

export type ComposerProps = {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
  /** Set by an example prompt, which pre-fills the box rather than sending. */
  draft: string;
  onDraftChange: (value: string) => void;
};

const MAX_HEIGHT = 200;

function Composer({ onSend, onStop, streaming, draft, onDraftChange }: ComposerProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  // Grow with the text, up to a ceiling. Reset to `auto` first or the box only
  // ever grows: `scrollHeight` of an already-tall element includes its height.
  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT)}px`;
  }, [draft]);

  const submit = () => {
    if (streaming || !draft.trim()) return;
    onSend(draft);
    onDraftChange("");
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="border-border bg-surface focus-within:border-border-strong rounded-2xl border transition-colors"
    >
      <textarea
        ref={ref}
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends, Shift+Enter breaks the line. On a touch keyboard
          // there is no Shift, so the newline key must stay a newline.
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder="Ask Molt AI anything…"
        aria-label="Message Molt AI"
        className="text-foreground placeholder:text-muted block max-h-[200px] w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[15px] leading-relaxed outline-none"
      />

      <div className="flex items-center justify-between gap-3 px-3 pb-3">
        <p className="text-muted hidden text-[11px] font-medium sm:block">
          Enter to send · Shift + Enter for a new line
        </p>

        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            className="border-border hover:border-border-strong text-foreground ml-auto inline-flex h-9 items-center gap-2 rounded-xl border px-3.5 text-[13px] font-bold transition-colors"
          >
            <Square className="size-3 fill-current" />
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send"
            className={cn(
              "bg-primary text-background hover:bg-primary-hover ml-auto inline-flex size-9 items-center justify-center rounded-xl transition-colors",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            <ArrowUp className="size-4" />
          </button>
        )}
      </div>
    </form>
  );
}

export { Composer };
