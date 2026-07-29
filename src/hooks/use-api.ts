"use client";

import * as React from "react";

import { ApiError } from "@/lib/api/client";

export type AsyncState<T> = {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** True only on the first load, so refreshes do not flash a skeleton. */
  initialLoading: boolean;
  refetch: () => void;
};

/**
 * Runs an async fetcher on mount, exposing loading and error state.
 *
 * Aborts in flight requests on unmount, and distinguishes the first load from
 * a refresh so the UI can keep showing data while it updates.
 */
export function useApi<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList = [],
): AsyncState<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const [nonce, setNonce] = React.useState(0);

  // The fetcher is usually an inline arrow; pin it so it does not retrigger.
  const fetcherRef = React.useRef(fetcher);
  fetcherRef.current = fetcher;

  React.useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setLoading(true);

    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!active || controller.signal.aborted) return;
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError({
                code: "unknown_error",
                message: "Something went wrong.",
                suggestedAction: "Retry the request.",
                status: 0,
              }),
        );
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setHasLoaded(true);
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps]);

  const refetch = React.useCallback(() => setNonce((value) => value + 1), []);

  return {
    data,
    error,
    loading,
    initialLoading: loading && !hasLoaded,
    refetch,
  };
}

/**
 * An action the user triggers, such as running an analysis.
 *
 * Unlike `useApi`, nothing runs until `run` is called.
 */
export function useApiAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
) {
  const [data, setData] = React.useState<TResult | null>(null);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [pending, setPending] = React.useState(false);

  const actionRef = React.useRef(action);
  actionRef.current = action;

  const run = React.useCallback(async (...args: TArgs) => {
    setPending(true);
    setError(null);

    try {
      const result = await actionRef.current(...args);
      setData(result);
      return result;
    } catch (caught: unknown) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError({
              code: "unknown_error",
              message: "Something went wrong.",
              suggestedAction: "Retry the request.",
              status: 0,
            }),
      );
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  const reset = React.useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, error, pending, run, reset };
}
