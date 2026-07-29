"use client";

import * as React from "react";

import { ApiError } from "@/lib/api/client";
import { api } from "@/lib/api/client";
import { streamAnalysis } from "@/lib/api/stream";
import type { AnalysisTarget, ExecutionResponse } from "@/lib/api/types";

/** Targets the streaming endpoint accepts. `auto` is not one of them. */
const STREAMABLE = new Set<string>([
  "token",
  "wallet",
  "contract",
  "project",
  "site",
]);

export type LiveAnalysis = {
  /** The finished run, once it has arrived. */
  result: ExecutionResponse | null;
  /**
   * Everything established so far, shaped like a result so the same component
   * renders it. Present from the moment the evidence is complete — roughly
   * halfway through a run — and replaced by `result` at the end.
   */
  preview: ExecutionResponse | null;
  /** Prose accumulated from the stream while the model is still writing. */
  summary: string;
  /** The stage currently running, for a progress line. */
  stage: string | null;
  /** Stages that have finished, with how long each took. */
  completed: { stage: string; durationMs: number | null }[];
  pending: boolean;
  error: ApiError | null;
  run: (target: string, subject: string) => Promise<ExecutionResponse | null>;
};

/**
 * Runs one analysis, showing it happen.
 *
 * The evidence is ready in roughly the first third of a run and then waits
 * behind an AI summary. Streaming lets the report render at that point instead
 * of at the end, which is most of the perceived speed — the work itself takes
 * exactly as long as it did.
 *
 * Free-form requests fall back to the plain POST: the router has to read the
 * text before it knows what the subject is, and the streaming route needs the
 * target up front.
 */
export function useLiveAnalysis(): LiveAnalysis {
  const [result, setResult] = React.useState<ExecutionResponse | null>(null);
  const [preview, setPreview] = React.useState<ExecutionResponse | null>(null);
  const [summary, setSummary] = React.useState("");
  const [stage, setStage] = React.useState<string | null>(null);
  const [completed, setCompleted] = React.useState<
    { stage: string; durationMs: number | null }[]
  >([]);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<ApiError | null>(null);

  const controller = React.useRef<AbortController | null>(null);

  // A run outlives the component if the user navigates away mid-analysis.
  React.useEffect(() => () => controller.current?.abort(), []);

  const run = React.useCallback(async (target: string, subject: string) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;

    setResult(null);
    setPreview(null);
    setSummary("");
    setStage(null);
    setCompleted([]);
    setError(null);
    setPending(true);

    try {
      const response = STREAMABLE.has(target)
        ? await streamAnalysis({
            target: target as AnalysisTarget,
            subject: target === "project" ? undefined : subject,
            signal: abort.signal,
            onStageStarted: setStage,
            onStageFinished: (name, durationMs) =>
              setCompleted((prior) => [...prior, { stage: name, durationMs }]),
            onEvidenceReady: (payload) =>
              setPreview(previewFrom(payload)),
            onSummaryDelta: (text) => setSummary((prior) => prior + text),
          })
        : await api.execute({ request: subject });

      setResult(response);
      return response;
    } catch (caught) {
      // An abort is the user's own doing — a new run, or leaving the page.
      if (caught instanceof DOMException && caught.name === "AbortError") {
        return null;
      }
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError({
              code: "unknown_error",
              message: "Something went wrong.",
              suggestedAction: "Retry the analysis.",
              status: 0,
            }),
      );
      return null;
    } finally {
      setPending(false);
      setStage(null);
    }
  }, []);

  return { result, preview, summary, stage, completed, pending, error, run };
}

/**
 * Shapes a mid-run snapshot like a finished response.
 *
 * The fields that are genuinely not known yet are left empty rather than
 * guessed — `summary` stays null so the renderer can tell "still writing" from
 * "wrote nothing", which are different outcomes.
 */
function previewFrom(payload: {
  target: AnalysisTarget | null;
  address: string | null;
  facts: Record<string, unknown>;
  evidence: ExecutionResponse["evidence"];
  sources: ExecutionResponse["sources"];
}): ExecutionResponse {
  return {
    execution_id: "",
    status: "running",
    stage: "report",
    target: payload.target,
    address: payload.address,
    agents_used: [],
    services_called: [],
    summary: null,
    summary_status: "pending",
    summary_detail: null,
    summary_model: null,
    facts: payload.facts,
    evidence: payload.evidence,
    sources: payload.sources,
    stages: [],
    tasks: [],
    execution_time_ms: null,
    error: null,
  };
}
