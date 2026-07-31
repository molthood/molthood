"use client";

import * as React from "react";
import { MessageSquare, Plus, Trash2 } from "lucide-react";

import type { Conversation } from "@/hooks/use-molt-chat";
import { cn } from "@/lib/utils";

export type ConversationListProps = {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  className?: string;
};

function ConversationList({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onNew,
  className,
}: ConversationListProps) {
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="p-3">
        <button
          type="button"
          onClick={onNew}
          className="border-border hover:border-border-strong hover:bg-surface text-foreground flex h-9 w-full items-center gap-2 rounded-lg border px-3 text-[13px] font-bold transition-colors"
        >
          <Plus className="size-4" />
          New chat
        </button>
      </div>

      <nav aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <ul className="flex flex-col gap-0.5">
          {conversations.map((conversation) => {
            const active = conversation.id === activeId;

            return (
              <li key={conversation.id} className="group/row relative">
                <button
                  type="button"
                  onClick={() => onSelect(conversation.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg py-2 pr-9 pl-3 text-left text-[13px] font-semibold transition-colors",
                    active
                      ? "bg-surface-raised text-foreground"
                      : "text-muted hover:bg-surface hover:text-foreground",
                  )}
                >
                  <MessageSquare
                    className={cn("size-3.5 shrink-0", active && "text-primary")}
                    aria-hidden="true"
                  />
                  <span className="truncate">{conversation.title}</span>
                </button>

                {/* Always reachable by keyboard, revealed by pointer. A delete
                    that only appears on hover is unusable without a mouse. */}
                <button
                  type="button"
                  onClick={() => onDelete(conversation.id)}
                  aria-label={`Delete ${conversation.title}`}
                  className="text-muted hover:text-danger absolute top-1/2 right-1 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export { ConversationList };
