"use client";

import * as React from "react";
import { PanelLeft, X } from "lucide-react";

import { ChatMessage } from "@/components/ai/chat-message";
import { Composer } from "@/components/ai/composer";
import { ConversationList } from "@/components/ai/conversation-list";
import { ModelPicker } from "@/components/ai/model-picker";
import { LogoMark } from "@/components/brand/logo";
import { AI_CAPABILITIES, AI_NAME, AI_TAGLINE, EXAMPLE_PROMPTS } from "@/config/ai";
import { useMoltChat } from "@/hooks/use-molt-chat";


/** Shown before the first question. */
function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-10 text-center sm:py-16">
      <LogoMark size={44} />
      <h1 className="font-display text-foreground mt-4 text-2xl font-bold sm:text-3xl">
        {AI_NAME}
      </h1>
      <p className="text-muted mt-2 max-w-lg text-sm leading-relaxed font-medium sm:text-base">
        {AI_TAGLINE}
      </p>

      <div className="mt-7 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {EXAMPLE_PROMPTS.map((example) => {
          const Icon = example.icon;
          return (
            <button
              key={example.label}
              type="button"
              onClick={() => onPick(example.prompt)}
              className="border-border hover:border-border-strong hover:bg-surface group flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors"
            >
              <Icon className="text-primary size-4 shrink-0" aria-hidden="true" />
              <span className="text-foreground text-[13px] font-semibold">
                {example.label}
              </span>
            </button>
          );
        })}
      </div>

      <ul className="text-muted mt-7 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[11px] font-medium">
        {AI_CAPABILITIES.map((capability) => (
          <li key={capability}>{capability}</li>
        ))}
      </ul>
    </div>
  );
}

function MoltAi() {
  const chat = useMoltChat();
  const [draft, setDraft] = React.useState("");
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const composerRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const pinnedRef = React.useRef(true);

  // Memoised because it feeds a dependency array: a fresh `[]` on every render
  // would re-run the scroll effect continuously.
  const messages = React.useMemo(() => chat.active?.messages ?? [], [chat.active]);
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  // Auto-scroll, but only while the reader is already at the bottom. Dragging
  // someone back down mid-sentence because a token arrived is worse than not
  // following at all — so scrolling up detaches, and returning re-attaches.
  const onScroll = React.useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    pinnedRef.current = distance < 80;
  }, []);

  React.useEffect(() => {
    if (!pinnedRef.current) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // A new chat starts pinned again regardless of where the last one was left.
  React.useEffect(() => {
    pinnedRef.current = true;
  }, [chat.activeId]);

  React.useEffect(() => {
    setSidebarOpen(false);
  }, [chat.activeId]);

  const pick = (prompt: string) => {
    setDraft(prompt);
    // Focus lands at the end so a prompt ending in ": " is ready to complete.
    const field = composerRef.current?.querySelector("textarea");
    if (field) {
      field.focus();
      requestAnimationFrame(() => {
        field.selectionStart = field.value.length;
        field.selectionEnd = field.value.length;
      });
    }
  };

  return (
    <div className="flex min-h-0 flex-1">
      {/* Desktop conversation rail. */}
      <aside className="border-border hidden w-64 shrink-0 border-r lg:flex lg:flex-col">
        <ConversationList
          conversations={chat.conversations}
          activeId={chat.activeId}
          onSelect={chat.selectChat}
          onDelete={chat.deleteChat}
          onNew={chat.newChat}
          className="flex-1"
        />
      </aside>

      {/* Mobile drawer, same component. */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close conversations"
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          />
          <div className="border-border bg-background absolute inset-y-0 left-0 flex w-[min(17rem,82vw)] flex-col border-r">
            <div className="border-border flex h-14 shrink-0 items-center justify-between border-b px-4">
              <span className="font-display text-foreground text-sm font-bold">Chats</span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close"
                className="text-muted hover:text-foreground inline-flex size-8 items-center justify-center rounded-md"
              >
                <X className="size-4" />
              </button>
            </div>
            <ConversationList
              conversations={chat.conversations}
              activeId={chat.activeId}
              onSelect={chat.selectChat}
              onDelete={chat.deleteChat}
              onNew={chat.newChat}
              className="flex-1"
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-border flex h-12 shrink-0 items-center gap-2 border-b px-3 lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open conversations"
            className="text-muted hover:text-foreground inline-flex size-8 items-center justify-center rounded-md"
          >
            <PanelLeft className="size-4" />
          </button>
          <span className="text-foreground truncate text-[13px] font-bold">
            {chat.active?.title ?? AI_NAME}
          </span>
        </div>

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {messages.length === 0 ? (
            <EmptyState onPick={pick} />
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:py-8">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isLast={message.id === lastAssistant?.id}
                  streaming={chat.streaming}
                  onRegenerate={chat.regenerate}
                  onAction={(prompt) =>
                    // A finished action sends; one ending in a space is an
                    // invitation to add something, so it fills the box instead.
                    prompt.endsWith(" ") ? pick(prompt) : chat.send(prompt)
                  }
                />
              ))}
              <div ref={endRef} className="h-px" />
            </div>
          )}
        </div>

        <div ref={composerRef} className="border-border shrink-0 border-t px-4 py-3 sm:py-4">
          <div className="mx-auto w-full max-w-3xl">
            <Composer
              onSend={chat.send}
              onStop={chat.stop}
              streaming={chat.streaming}
              draft={draft}
              onDraftChange={setDraft}
            />

            {chat.models.length > 0 ? (
              <div className="mt-2 flex justify-center">
                <ModelPicker
                  models={chat.models}
                  value={chat.model}
                  onChange={chat.setModel}
                  // Locked mid-answer: the request in flight already named one,
                  // and a picker that changed while tokens arrived would claim
                  // the text on screen came from a model that never saw it.
                  disabled={chat.streaming}
                />
              </div>
            ) : null}

            <p className="text-muted mt-2 text-center text-[11px] font-medium">
              {chat.thinking
                ? "Reasoning…"
                : "Molthood Agent can be wrong. It states what it could not check rather than guessing."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export { MoltAi };
