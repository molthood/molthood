/**
 * Molthood Agent — the only place that holds the provider key.
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

import { resolveModel } from "@/lib/ai/catalogue";
import { anyProviderConfigured } from "@/lib/ai/config";
import { reportFailure, reportSuccess, usableRoutes } from "@/lib/ai/providers/health";
import { DEFAULT_MODEL_ID, findModel } from "@/lib/ai/providers/registry";
import {
  ProviderError,
  streamRound,
  type ChatMessage,
  type RoundResult,
} from "@/lib/ai/providers/stream";
import { detectIntent, effectiveIntent, lastSubject } from "@/lib/ai/intent";
import {
  actionsFor,
  cardsFor,
  confidenceFor,
  mergeSources,
  type AnalysisCard,
} from "@/lib/ai/report";
import { SYSTEM_PROMPT, briefing } from "@/lib/ai/system-prompt";
import { phaseSteps, planFor, recordedSteps } from "@/lib/ai/timeline";
import {
  TOOL_LABELS,
  TOOL_SCHEMAS,
  badgesFor,
  runTool,
  type SourceRef,
} from "@/lib/ai/tools";

export const runtime = "nodejs";
/** Never cached, and never statically evaluated at build time. */
export const dynamic = "force-dynamic";

/**
 * Text a round emits before calling a tool is announcement — "I'll look up the
 * roadmap now" — and asking the model not to write it only works about a third
 * of the time. So it is held instead of streamed, and thrown away if tool
 * calls follow.
 *
 * The buffer is small on purpose: a real answer passes this within a few
 * tokens and flushes, so nothing perceptible is delayed. Only the short
 * sentence that precedes a tool call is ever withheld, and only until it is
 * known to be one.
 */
const PREAMBLE_LIMIT = 200;

/** How many times the model may call tools before it must answer. */
const MAX_TOOL_ROUNDS = 3;

type IncomingMessage = { role: "user" | "assistant"; content: string };

function event(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(payload)}\n`);
}

function friendlyError(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof ProviderError) {
    if (error.status === 401 || error.status === 403) {
      return {
        message:
          "Molthood Agent is not authorised with the provider. The API key is missing or no longer valid.",
        retryable: false,
      };
    }
    if (error.status === 429) {
      return {
        message: "Molthood Agent is rate limited right now. Waiting a moment usually clears it.",
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
    message: "Molthood Agent could not be reached. Check your connection and try again.",
    retryable: true,
  };
}

export async function POST(request: Request) {
  if (!anyProviderConfigured()) {
    return Response.json(
      {
        error:
          "Molthood Agent is not configured on this deployment. No AI provider key is set.",
        code: "not_configured",
        retryable: false,
      },
      { status: 503 },
    );
  }

  let body: { messages?: IncomingMessage[]; model?: unknown };
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

  const model = await resolveModel(body.model);

  // Routing happens here, not in the model. A 42-character hex string is an
  // address whoever is asking and however they phrase it, and deciding that
  // deterministically means the same question always takes the same path.
  const question = incoming[incoming.length - 1]?.content ?? "";
  const detection = detectIntent(question);
  // Carried from earlier turns so "compare it with BTC" still has a subject.
  const carried = detection.subject ? null : lastSubject(incoming);
  // Actions and confidence follow the conversation's subject, not this
  // sentence's grammar. "So is it safe to hold overnight?" reads as research
  // on its own words while still being about the address two turns up.
  const intent = effectiveIntent(detection, carried, question);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "system",
      content: briefing(detection, carried),
    },
    ...incoming.map((message) => ({ role: message.role, content: message.content })),
  ];

  const selected = findModel(model) ?? findModel(DEFAULT_MODEL_ID)!;
  const routes = await usableRoutes(selected);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      /**
       * One round, tried against each healthy route in turn.
       *
       * A provider that fails here is recorded as unhealthy, so the *next*
       * request skips it rather than rediscovering the outage. The reader sees
       * nothing: a fallback that announced itself would be telling them about
       * an implementation detail they cannot act on.
       *
       * Only a round that produced no output may fall through. Once text has
       * been streamed, retrying elsewhere would restart the answer mid-
       * sentence and the reader would watch it contradict itself.
       */
      const runRound = async (
        conversation: ChatMessage[],
        allowTools: boolean,
      ): Promise<RoundResult> => {
        let lastError: unknown = new ProviderError(503, "No route available.");

        for (const route of routes) {
          let produced = false;
          let held = "";
          let holding = allowTools;

          const flush = () => {
            if (!held) return;
            controller.enqueue(event({ type: "delta", text: held }));
            held = "";
          };

          try {
            const result = await streamRound({
              route,
              messages: conversation,
              tools: allowTools ? TOOL_SCHEMAS : undefined,
              signal: request.signal,
              handlers: {
                onText: (chunk) => {
                  if (holding) {
                    held += chunk;
                    if (held.length < PREAMBLE_LIMIT) return;
                    // Long enough to be the answer itself, not a preamble.
                    holding = false;
                    produced = true;
                    flush();
                    return;
                  }
                  produced = true;
                  controller.enqueue(event({ type: "delta", text: chunk }));
                },
                onReasoning: () =>
                  controller.enqueue(
                    event({ type: "phase", steps: phaseSteps(intent, "reasoning") }),
                  ),
              },
            });
            reportSuccess(route.provider);
            // Held text survives only when the round turned out to be the
            // answer. If tool calls came back, it was an announcement.
            if (result.toolCalls.length === 0) {
              holding = false;
              flush();
            } else {
              held = "";
            }
            return result;
          } catch (error) {
            if (error instanceof Error && error.name === "AbortError") throw error;
            lastError = error;
            const detail =
              error instanceof ProviderError ? `http_${error.status}` : "unreachable";
            reportFailure(route.provider, detail);
            // Anything held for a route that failed belongs to that attempt.
            held = "";
            if (produced) throw error;
          }
        }

        throw lastError;
      };

      // Named up front, because the client may have asked for a model this
      // deployment does not offer and been given the default instead. A UI
      // showing one model while another answered is a lie the user cannot see.
      controller.enqueue(event({ type: "model", id: model }));

      // The plan, written from the intent and shown before anything slow
      // starts. A wallet question and a repository question get different
      // lists because they genuinely do different work.
      controller.enqueue(event({ type: "plan", steps: planFor(intent) }));
      controller.enqueue(
        event({ type: "stage", id: "detect", label: detection.label, status: "ok" }),
      );

      // The model is resolved before any request goes out, so this row is
      // true the moment it appears rather than after a round trip.


      const sources: SourceRef[] = [];
      const cards: AnalysisCard[] = [];
      const badges = new Set<string>();
      const outcomes = { ok: 0, failed: 0 };

      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
          // The final round drops the tools entirely, so the model cannot ask
          // for another one it will not be allowed to run — it has to answer.
          const allowTools = round < MAX_TOOL_ROUNDS;
          const result = await runRound(messages, allowTools);

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
            controller.enqueue(
              event({ type: "phase", steps: phaseSteps(intent, "tools") }),
            );

            let args: Record<string, unknown> = {};
            try {
              args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
            } catch {
              // Malformed arguments are the model's mistake, and it can
              // recover from being told so.
              args = {};
            }

            for (const badge of badgesFor(call.function.name, args)) {
              badges.add(badge);
            }

            const toolResult = await runTool(call.function.name, args);

            if (toolResult.available) outcomes.ok += 1;
            else outcomes.failed += 1;

            sources.push(...mergeSources([toolResult.sources]));
            // Cards come from the tool payload, never from the prose. A card
            // built by parsing the answer can be wrong in a way that looks
            // identical to one that was measured.
            cards.push(...cardsFor(call.function.name, toolResult));

            controller.enqueue(
              event({
                type: "tool",
                name: call.function.name,
                label,
                status: toolResult.available ? "ok" : "unavailable",
                reason: toolResult.reason,
                detail: toolResult.detail,
              }),
            );

            // The engine reports what it actually ran. Those replace the
            // planned labels — a step nobody performed is never ticked.
            for (const step of recordedSteps(toolResult.data)) {
              controller.enqueue(event({ type: "stage", ...step }));
            }

            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify(toolResult),
            });
          }
        }

        // Announced once the tools are done and before the closing summary
        // rows, so the timeline reads as a sequence rather than a list that
        // filled in from both ends.
        controller.enqueue(
          event({ type: "phase", steps: phaseSteps(intent, "writing") }),
        );
        controller.enqueue(
          event({
            type: "stage",
            id: "compose",
            label: intent === "artifact" ? "Packaging the file" : "Building the response",
            status: "ok",
          }),
        );

        if (badges.size > 0) {
          controller.enqueue(event({ type: "badges", badges: [...badges] }));
        }

        if (cards.length > 0) {
          controller.enqueue(event({ type: "cards", cards }));
        }

        const merged = mergeSources([sources]);
        if (merged.length > 0) {
          controller.enqueue(event({ type: "sources", sources: merged }));
        }

        const confidence = confidenceFor(intent, outcomes);
        if (confidence) {
          controller.enqueue(event({ type: "confidence", ...confidence }));
        }

        controller.enqueue(
          event({
            type: "actions",
            actions: actionsFor(intent, detection.subject ?? carried?.subject),
          }),
        );

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
