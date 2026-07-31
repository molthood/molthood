/**
 * Molt AI — the only place that holds the provider key.
 *
 * The browser posts a conversation here and reads back a stream of
 * newline-delimited JSON events. Newline-delimited rather than SSE because
 * this endpoint is consumed by one client that already parses JSON: the `data:`
 * framing would buy nothing and cost a parser.
 *
 * Tool calls are handled inside a single response. The model streams, and if
 * what it streams turns out to be tool calls rather than prose, the tools run
 * and a second stream continues the same answer. The client sees one
 * uninterrupted message plus tool events it can render as a timeline.
 */

import { AI_API_KEY, AI_BASE_URL, AI_MODEL, isConfigured } from "@/lib/ai/config";
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { TOOL_LABELS, TOOL_SCHEMAS, runTool } from "@/lib/ai/tools";

export const runtime = "nodejs";
/** Never cached, and never statically evaluated at build time. */
export const dynamic = "force-dynamic";

/** How many times the model may call tools before it must answer. */
const MAX_TOOL_ROUNDS = 3;

type Role = "system" | "user" | "assistant" | "tool";

type ChatMessage = {
  role: Role;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type IncomingMessage = { role: "user" | "assistant"; content: string };

function event(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(payload)}\n`);
}

/**
 * Merges streamed tool-call deltas.
 *
 * The provider sends a tool call across many chunks: the name arrives once,
 * the arguments arrive character by character, and both are keyed by `index`
 * rather than by id. Accumulating by index is the only correct way to
 * reassemble them — keying on `id` drops every chunk after the first, which
 * produces a call with an empty argument string and a tool that silently runs
 * with no input.
 */
function mergeToolCallDelta(
  accumulated: Map<number, ToolCall>,
  delta: {
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  },
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

type RoundResult = {
  text: string;
  toolCalls: ToolCall[];
  finishReason: string | null;
};

/** One streamed completion. Emits text deltas as they arrive. */
async function streamRound(
  messages: ChatMessage[],
  controller: ReadableStreamDefaultController<Uint8Array>,
  signal: AbortSignal,
  allowTools: boolean,
): Promise<RoundResult> {
  const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    signal,
    body: JSON.stringify({
      model: AI_MODEL,
      messages,
      stream: true,
      ...(allowTools ? { tools: TOOL_SCHEMAS, tool_choice: "auto" } : {}),
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
  // A thinking model can spend a long time before its first visible token.
  // The client shows a different state for that, so it is worth announcing.
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
        controller.enqueue(event({ type: "delta", text: delta.content }));
      } else if (
        !announcedReasoning &&
        (delta.reasoning_content || delta.reasoning)
      ) {
        announcedReasoning = true;
        controller.enqueue(event({ type: "thinking" }));
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

class ProviderError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`The AI provider answered ${status}.`);
  }
}

function friendlyError(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof ProviderError) {
    if (error.status === 401 || error.status === 403) {
      return {
        message:
          "Molt AI is not authorised with the provider. The API key is missing or no longer valid.",
        retryable: false,
      };
    }
    if (error.status === 429) {
      return {
        message: "Molt AI is rate limited right now. Waiting a moment usually clears it.",
        retryable: true,
      };
    }
    if (error.status >= 500) {
      return {
        message: "The AI provider is having trouble. This is upstream, not your request.",
        retryable: true,
      };
    }
    return { message: `The AI provider rejected the request (${error.status}).`, retryable: false };
  }

  if (error instanceof Error && error.name === "AbortError") {
    return { message: "Generation stopped.", retryable: true };
  }

  return {
    message: "Molt AI could not be reached. Check your connection and try again.",
    retryable: true,
  };
}

export async function POST(request: Request) {
  if (!isConfigured()) {
    return Response.json(
      {
        error:
          "Molt AI is not configured on this deployment. Set AI_API_KEY to enable it.",
        code: "not_configured",
        retryable: false,
      },
      { status: 503 },
    );
  }

  let body: { messages?: IncomingMessage[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed request body.", code: "bad_request" }, { status: 400 });
  }

  const incoming = (body.messages ?? [])
    .filter(
      (message): message is IncomingMessage =>
        !!message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string",
    )
    // Long conversations are supported by carrying the tail rather than the
    // whole history: a context window is finite, and the alternative is a
    // conversation that works until the day it abruptly stops.
    .slice(-40);

  if (incoming.length === 0) {
    return Response.json({ error: "No messages to answer.", code: "bad_request" }, { status: 400 });
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...incoming.map((message) => ({ role: message.role, content: message.content })),
  ];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
          // The final round drops the tools entirely, so the model cannot ask
          // for another one it will not be allowed to run — it has to answer.
          const allowTools = round < MAX_TOOL_ROUNDS;
          const result = await streamRound(
            messages,
            controller,
            request.signal,
            allowTools,
          );

          if (result.toolCalls.length === 0) break;

          // The model often narrates before calling a tool ("I'll run the
          // analysis now"), and the next round resumes in the same message —
          // so without this the sentence collides with the heading that
          // follows it: "…now.# Hoodrat".
          if (result.text.trim() && !result.text.endsWith("\n")) {
            controller.enqueue(event({ type: "delta", text: "\n\n" }));
          }

          messages.push({
            role: "assistant",
            content: result.text || null,
            tool_calls: result.toolCalls,
          });

          for (const call of result.toolCalls) {
            const label = TOOL_LABELS[call.function.name] ?? call.function.name;
            controller.enqueue(
              event({ type: "tool", name: call.function.name, label, status: "running" }),
            );

            let args: Record<string, unknown> = {};
            try {
              args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
            } catch {
              // Malformed arguments are the model's mistake, and it can
              // recover from being told so.
              args = {};
            }

            const toolResult = await runTool(call.function.name, args);

            controller.enqueue(
              event({
                type: "tool",
                name: call.function.name,
                label,
                status: toolResult.available ? "ok" : "unavailable",
                reason: toolResult.reason,
              }),
            );

            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify(toolResult),
            });
          }
        }

        controller.enqueue(event({ type: "done" }));
      } catch (error) {
        const { message, retryable } = friendlyError(error);
        controller.enqueue(event({ type: "error", message, retryable }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Proxies that buffer a response defeat streaming entirely; the answer
      // arrives complete, at the end, looking like a very slow request.
      "X-Accel-Buffering": "no",
    },
  });
}
