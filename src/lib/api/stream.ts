/**
 * Consumes the backend's server-sent analysis stream.
 *
 * Written by hand rather than with `EventSource` for one reason that matters:
 * `EventSource` cannot report *why* a connection failed. It fires a bare
 * `error` with no status and no body, so a backend that is simply not running
 * would be indistinguishable from one that rejected the address — and this
 * console's whole contract is that a failure says what went wrong and what to
 * do about it. `fetch` keeps the `ApiError` envelope every other call returns.
 */

import { ApiError, API_BASE_URL } from "@/lib/api/client";
import { authHeaders } from "@/lib/api/credentials";
import type {
  AnalysisTarget,
  ApiErrorBody,
  EvidenceItem,
  ExecutionResponse,
  SourceRef,
} from "@/lib/api/types";

/** Everything the run has established; only the summary is still pending. */
export type EvidenceReady = {
  target: AnalysisTarget | null;
  address: string | null;
  facts: Record<string, unknown>;
  evidence: EvidenceItem[];
  sources: SourceRef[];
};

export type StreamHandlers = {
  onStageStarted?: (stage: string) => void;
  onStageFinished?: (stage: string, durationMs: number | null) => void;
  onEvidenceReady?: (payload: EvidenceReady) => void;
  onSummaryDelta?: (text: string) => void;
};

type StreamRequest = {
  target: AnalysisTarget;
  /** A 0x address, a URL for `site`, or omitted entirely for `project`. */
  subject?: string;
  signal?: AbortSignal;
} & StreamHandlers;

/** SSE frames are separated by a blank line; fields are `name: value`. */
function parseFrame(frame: string): { event: string; data: string } | null {
  let event = "message";
  const data: string[] = [];

  for (const line of frame.split("\n")) {
    // A line starting with ':' is a comment — the keep-alive the server sends
    // so proxies do not close an idle connection mid-analysis.
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }

  return data.length ? { event, data: data.join("\n") } : null;
}

/**
 * Runs one analysis, reporting progress as it happens.
 *
 * Resolves with the complete result — identical to what the REST routes
 * return — so a caller that ignores every handler still gets the whole thing.
 */
export async function streamAnalysis({
  target,
  subject,
  signal,
  onStageStarted,
  onStageFinished,
  onEvidenceReady,
  onSummaryDelta,
}: StreamRequest): Promise<ExecutionResponse> {
  const params = new URLSearchParams({ target });
  if (subject) params.set("subject", subject);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/stream?${params.toString()}`, {
      // Analyses are metered, so the stream authenticates exactly like every
      // other call. This is also why `EventSource` is unusable here — it
      // cannot send an Authorization header at all.
      headers: { accept: "text/event-stream", ...authHeaders() },
      signal,
      cache: "no-store",
    });
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") throw caught;
    throw new ApiError({
      code: "network_unreachable",
      message: "Cannot reach the Molthood API.",
      suggestedAction: `Start the backend with \`uvicorn app.main:app\` and confirm it is on ${API_BASE_URL}.`,
      status: 0,
    });
  }

  if (!response.ok || !response.body) {
    let payload: ApiErrorBody | null = null;
    try {
      payload = (await response.json()) as ApiErrorBody;
    } catch {
      // Not the standard envelope; fall through to a generic message.
    }
    throw new ApiError({
      code: payload?.error.code ?? "http_error",
      message: payload?.error.message ?? `The stream could not be opened (${response.status}).`,
      suggestedAction: payload?.error.suggested_action ?? "Retry the analysis.",
      status: response.status,
      requestId: payload?.request_id ?? null,
    });
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let result: ExecutionResponse | null = null;
  let failure: ApiError | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;

      // A chunk can split a frame anywhere, so only complete frames — those
      // terminated by a blank line — are dispatched. The remainder stays in
      // the buffer until the rest of it arrives.
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        const parsed = parseFrame(frame);
        if (!parsed) continue;

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(parsed.data) as Record<string, unknown>;
        } catch {
          // One malformed frame must not abandon a run that is nearly done.
          continue;
        }

        switch (parsed.event) {
          case "stage_started":
            onStageStarted?.(String(payload.stage));
            break;
          case "stage_finished":
            onStageFinished?.(
              String(payload.stage),
              typeof payload.duration_ms === "number" ? payload.duration_ms : null,
            );
            break;
          case "evidence_ready":
            onEvidenceReady?.(payload as unknown as EvidenceReady);
            break;
          case "summary_delta":
            if (typeof payload.text === "string") onSummaryDelta?.(payload.text);
            break;
          case "result":
            result = payload as unknown as ExecutionResponse;
            break;
          case "error":
            failure = new ApiError({
              code: String(payload.code ?? "execution_failed"),
              message: String(payload.message ?? "The analysis failed."),
              suggestedAction: "Retry, or check the API logs.",
              status: 500,
            });
            break;
        }
      }
    }
  } finally {
    // Releases the connection when the caller aborts mid-run, so the backend
    // stops working for a reader who has navigated away.
    reader.cancel().catch(() => undefined);
  }

  if (failure) throw failure;
  if (!result) {
    throw new ApiError({
      code: "stream_incomplete",
      message: "The stream ended before the analysis returned a result.",
      suggestedAction: "Retry the analysis.",
      status: 0,
    });
  }

  return result;
}
