"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Check, Link2 } from "lucide-react";

import { AnalysisResult } from "@/components/console/analysis-result";
import { ApiKeyPanel } from "@/components/console/api-key-panel";
import { ErrorState } from "@/components/console/error-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { useCredential } from "@/hooks/use-credential";
import { api } from "@/lib/api/client";

/**
 * One stored analysis, addressable by URL.
 *
 * This is the whole point of making history durable: a finding nobody can
 * link to may as well not have been made. The page reads the *stored* result
 * rather than re-running the analysis, so the numbers a reader sees are the
 * ones the run actually produced.
 */
function ExecutionDetailLive({ executionId }: { executionId: string }) {
  const { hasKey } = useCredential();
  const execution = useApi(
    (signal) => api.executionResult(executionId, signal),
    [executionId, hasKey],
  );

  // A stored analysis belongs to the key that ran it, so a link is only
  // followable by its owner. Sending a stranger to the setup panel is the
  // honest response — the alternative would be publishing whatever address
  // somebody asked about to anyone who has ever seen the URL.
  if (!hasKey) {
    return <ApiKeyPanel />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="secondary" size="sm">
          <Link href="/console/executions">
            <ArrowLeft aria-hidden="true" />
            All executions
          </Link>
        </Button>
        <CopyLink />
      </div>

      {execution.loading ? (
        <Card className="flex flex-col gap-3 p-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </Card>
      ) : execution.error ? (
        <ErrorState error={execution.error} onRetry={execution.refetch} />
      ) : execution.data ? (
        <AnalysisResult result={execution.data} />
      ) : null}
    </div>
  );
}

/** Copies the current URL — the reason this page exists. */
function CopyLink() {
  const [copied, setCopied] = React.useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      // Reverts on its own so the button never looks stuck in a done state.
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the URL is in the address bar
      // regardless, so this needs no error surface of its own.
    }
  };

  return (
    <Button variant="secondary" size="sm" onClick={onCopy}>
      {copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

export { ExecutionDetailLive };
