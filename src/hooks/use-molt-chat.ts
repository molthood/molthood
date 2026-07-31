"use client";

import * as React from "react";

/**
 * Conversation state for Molt AI: streaming, history, persistence.
 *
 * All of it lives in the browser. There is no account system yet, and storing
 * conversations server-side without one would mean either a shared list
 * everybody can read or an identity nobody asked to create. `localStorage` is
 * the honest option until keys are attached to a user.
 */

const STORAGE_KEY = "molthood.ai.conversations.v1";
const ACTIVE_KEY = "molthood.ai.active.v1";

export type ToolEvent = {
  name: string;
  label: string;
  status: "running" | "ok" | "unavailable";
  reason?: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Tool activity for an assistant turn, in the order it happened. */
  tools?: ToolEvent[];
  /** Set when the turn ended badly. The bubble renders a retry instead. */
  error?: string;
  createdAt: number;
};

export type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The first line of the opening question, which is what people scan for. */
function titleFrom(text: string): string {
  const line = text.trim().split("\n")[0].trim();
  if (!line) return "New chat";
  return line.length > 48 ? `${line.slice(0, 47)}…` : line;
}

function emptyConversation(): Conversation {
  return { id: newId(), title: "New chat", messages: [], updatedAt: Date.now() };
}

function load(): { conversations: Conversation[]; activeId: string } {
  const fallback = emptyConversation();

  if (typeof window === "undefined") {
    return { conversations: [fallback], activeId: fallback.id };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Conversation[]) : [];
    const conversations = Array.isArray(parsed) && parsed.length > 0 ? parsed : [fallback];
    const stored = window.localStorage.getItem(ACTIVE_KEY);
    const activeId = conversations.some((c) => c.id === stored)
      ? (stored as string)
      : conversations[0].id;
    return { conversations, activeId };
  } catch {
    // A corrupt or unreadable store must not take the page down with it.
    return { conversations: [fallback], activeId: fallback.id };
  }
}

export function useMoltChat() {
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [activeId, setActiveId] = React.useState<string>("");
  const [streaming, setStreaming] = React.useState(false);
  const [thinking, setThinking] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  // Hydrated in an effect rather than in the initial state: reading
  // `localStorage` during render produces server and client markup that
  // disagree, and React discards the whole tree when they do.
  React.useEffect(() => {
    const { conversations: stored, activeId: id } = load();
    setConversations(stored);
    setActiveId(id);
  }, []);

  React.useEffect(() => {
    if (conversations.length === 0) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
      window.localStorage.setItem(ACTIVE_KEY, activeId);
    } catch {
      // Quota or a private-mode restriction. The chat still works in memory.
    }
  }, [conversations, activeId]);

  const active = React.useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const patchActive = React.useCallback(
    (update: (conversation: Conversation) => Conversation) => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === activeId ? update(conversation) : conversation,
        ),
      );
    },
    [activeId],
  );

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setThinking(false);
  }, []);

  /** Streams an answer for whatever history is passed in. */
  const run = React.useCallback(
    async (history: Message[]) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      setThinking(false);

      const replyId = newId();
      patchActive((conversation) => ({
        ...conversation,
        messages: [
          ...conversation.messages,
          { id: replyId, role: "assistant", content: "", createdAt: Date.now() },
        ],
        updatedAt: Date.now(),
      }));

      const patchReply = (update: (message: Message) => Message) => {
        patchActive((conversation) => ({
          ...conversation,
          messages: conversation.messages.map((message) =>
            message.id === replyId ? update(message) : message,
          ),
          updatedAt: Date.now(),
        }));
      };

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            messages: history.map(({ role, content }) => ({ role, content })),
          }),
        });

        if (!response.ok || !response.body) {
          const detail = await response.json().catch(() => null);
          patchReply((message) => ({
            ...message,
            error:
              detail?.error ??
              "Molt AI could not answer. The provider may be unavailable.",
          }));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;

            let payload: {
              type: string;
              text?: string;
              message?: string;
              name?: string;
              label?: string;
              status?: ToolEvent["status"];
              reason?: string;
            };
            try {
              payload = JSON.parse(line);
            } catch {
              continue;
            }

            if (payload.type === "delta" && payload.text) {
              setThinking(false);
              patchReply((message) => ({
                ...message,
                content: message.content + payload.text,
              }));
            } else if (payload.type === "thinking") {
              setThinking(true);
            } else if (payload.type === "tool" && payload.name && payload.label) {
              patchReply((message) => {
                const tools = [...(message.tools ?? [])];
                // The same tool reports twice — running, then its outcome —
                // and the second report replaces the first rather than
                // stacking a duplicate row under it.
                const index = tools.findIndex(
                  (tool) => tool.name === payload.name && tool.status === "running",
                );
                const next: ToolEvent = {
                  name: payload.name as string,
                  label: payload.label as string,
                  status: payload.status ?? "running",
                  reason: payload.reason,
                };
                if (index >= 0) tools[index] = next;
                else tools.push(next);
                return { ...message, tools };
              });
            } else if (payload.type === "error") {
              patchReply((message) => ({ ...message, error: payload.message }));
            }
          }
        }
      } catch (error) {
        // A deliberate stop is not a failure, and the partial answer stays.
        if (!(error instanceof Error && error.name === "AbortError")) {
          patchReply((message) => ({
            ...message,
            error: "The connection dropped before the answer finished.",
          }));
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
        setThinking(false);
      }
    },
    [patchActive],
  );

  const send = React.useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || streaming || !active) return;

      const message: Message = {
        id: newId(),
        role: "user",
        content,
        createdAt: Date.now(),
      };
      const history = [...active.messages, message];

      patchActive((conversation) => ({
        ...conversation,
        title:
          conversation.messages.length === 0 ? titleFrom(content) : conversation.title,
        messages: history,
        updatedAt: Date.now(),
      }));

      void run(history);
    },
    [active, patchActive, run, streaming],
  );

  /** Drops the last answer and asks again from the same question. */
  const regenerate = React.useCallback(() => {
    if (!active || streaming) return;

    const messages = [...active.messages];
    while (messages.length > 0 && messages[messages.length - 1].role === "assistant") {
      messages.pop();
    }
    if (messages.length === 0) return;

    patchActive((conversation) => ({ ...conversation, messages }));
    void run(messages);
  }, [active, patchActive, run, streaming]);

  const newChat = React.useCallback(() => {
    stop();
    const conversation = emptyConversation();
    setConversations((current) => [conversation, ...current]);
    setActiveId(conversation.id);
  }, [stop]);

  const deleteChat = React.useCallback(
    (id: string) => {
      setConversations((current) => {
        const remaining = current.filter((conversation) => conversation.id !== id);
        // Never leave the workspace with nothing selected — an empty list has
        // no "new chat" affordance in the transcript, only in the sidebar.
        const next = remaining.length > 0 ? remaining : [emptyConversation()];
        if (id === activeId) setActiveId(next[0].id);
        return next;
      });
    },
    [activeId],
  );

  const selectChat = React.useCallback(
    (id: string) => {
      stop();
      setActiveId(id);
    },
    [stop],
  );

  return {
    conversations,
    active,
    activeId,
    streaming,
    thinking,
    /** False until `localStorage` has been read, so the shell can hold still. */
    ready: conversations.length > 0,
    send,
    stop,
    regenerate,
    newChat,
    deleteChat,
    selectChat,
  };
}
