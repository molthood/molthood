/**
 * One streamed completion, against whichever provider a route names.
 *
 * All four speak the OpenAI chat-completions wire format, so there is one
 * implementation rather than four adapters that drift. What varies is the
 * host, the key, and the model id — which is exactly what a route carries.
 */

import { PROVIDERS } from "@/lib/ai/providers/registry";
import type { ModelRoute } from "@/lib/ai/providers/types";

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

export type RoundResult = {
  text: string;
  toolCalls: ToolCall[];
  finishReason: string | null;
};

export class ProviderError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Provider answered ${status}.`);
  }
}

/**
 * Merges streamed tool-call deltas.
 *
 * A tool call arrives across many chunks: the name once, the arguments
 * character by character, both keyed by `index` rather than by id.
 * Accumulating by index is the only correct way to reassemble them — keying on
 * `id` keeps the first chunk and drops the rest, producing a call with an
 * empty argument string that runs a tool against no input at all.
 */
function mergeToolCallDelta(
  accumulated: Map<number, ToolCall>,
  delta: { index: number; id?: string; function?: { name?: string; arguments?: string } },
) {
  const existing = accumulated.get(delta.index) ?? {
    id: "",
    type: "function" as const,
    function: { name: "", arguments: "" },
  };

  accumulated.set(delta.index, {
    id: delta.id ?? existing.id,
    type: "function",
    function: {
      name: delta.function?.name ?? existing.function.name,
      arguments: existing.function.arguments + (delta.function?.arguments ?? ""),
    },
  });
}

export type StreamHandlers = {
  onText: (chunk: string) => void;
  /** Fired once, when a model spends time reasoning before its first token. */
  onReasoning: () => void;
};

export async function streamRound({
  route,
  messages,
  tools,
  signal,
  handlers,
}: {
  route: ModelRoute;
  messages: ChatMessage[];
  tools?: unknown;
  signal: AbortSignal;
  handlers: StreamHandlers;
}): Promise<RoundResult> {
  const provider = PROVIDERS[route.provider];

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    signal,
    body: JSON.stringify({
      model: route.model,
      messages,
      stream: true,
      ...(tools && provider.supportsTools ? { tools, tool_choice: "auto" } : {}),
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new ProviderError(response.status, detail.slice(0, 400));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const toolCalls = new Map<number, ToolCall>();
  let text = "";
  let finishReason: string | null = null;
  let buffer = "";
  let announcedReasoning = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // The last element is a partial line unless the chunk ended on a break.
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;

      let parsed: {
        choices?: {
          delta?: {
            content?: string | null;
            reasoning_content?: string | null;
            reasoning?: string | null;
            tool_calls?: {
              index: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }[];
          };
          finish_reason?: string | null;
        }[];
      };

      try {
        parsed = JSON.parse(payload);
      } catch {
        // A malformed chunk is not worth failing an answer over.
        continue;
      }

      const choice = parsed.choices?.[0];
      if (!choice) continue;

      if (choice.finish_reason) finishReason = choice.finish_reason;

      const delta = choice.delta;
      if (!delta) continue;

      if (delta.content) {
        text += delta.content;
        handlers.onText(delta.content);
      } else if (!announcedReasoning && (delta.reasoning_content || delta.reasoning)) {
        announcedReasoning = true;
        handlers.onReasoning();
      }

      for (const call of delta.tool_calls ?? []) {
        mergeToolCallDelta(toolCalls, call);
      }
    }
  }

  return {
    text,
    toolCalls: [...toolCalls.values()].filter((call) => call.function.name),
    finishReason,
  };
}
