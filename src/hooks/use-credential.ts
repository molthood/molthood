"use client";

import * as React from "react";

import { onApiKeyChange, readApiKey, writeApiKey } from "@/lib/api/credentials";

/**
 * The API key this browser is using, kept in sync across tabs.
 *
 * `useSyncExternalStore` rather than `useState` + an effect, because the key
 * lives in `localStorage` — outside React — and two tabs of the console must
 * not disagree about whether one is signed in.
 *
 * The server snapshot is `null` on purpose. `localStorage` does not exist
 * during server rendering, and returning anything else would produce markup
 * that contradicts the client's first paint and break hydration.
 */
export function useCredential() {
  const key = React.useSyncExternalStore(
    onApiKeyChange,
    readApiKey,
    () => null,
  );

  return {
    key,
    hasKey: key !== null && key.length > 0,
    setKey: React.useCallback((value: string | null) => writeApiKey(value), []),
  };
}
