"use client";

import * as React from "react";
import Link from "next/link";
import { ListChecks, Play, RefreshCw } from "lucide-react";

import { AnalysisResult } from "@/components/console/analysis-result";
import { ApiKeyPanel } from "@/components/console/api-key-panel";
import { EmptyState } from "@/components/console/empty-state";
import { ErrorState, InlineError } from "@/components/console/error-state";
import { SectionHeader } from "@/components/console/section-header";
import { TickerSearch } from "@/components/console/ticker-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/loading-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/hooks/use-api";
import { useCredential } from "@/hooks/use-credential";
import { useLiveAnalysis } from "@/hooks/use-live-analysis";
import { api } from "@/lib/api/client";
import type { ExecutionResponse } from "@/lib/api/types";
import { formatRelativeTime, shortenAddress } from "@/lib/format";
import { describeServices } from "@/lib/service-labels";
import { cn } from "@/lib/utils";

const TARGETS = [
  { value: "auto", label: "Auto-detect" },
  { value: "token", label: "Token" },
  { value: "wallet", label: "Wallet" },
  { value: "contract", label: "Contract" },
  { value: "project", label: "Chain overview" },
  { value: "site", label: "Website" },
] as const;

/** A website is identified by a URL; everything else by a 0x address. */
const TAKES_URL = "site";
const TAKES_NOTHING = "project";

const STATUS_VARIANT: Record<string, "success" | "danger" | "info" | "default"> = {
  succeeded: "success",
  failed: "danger",
  running: "info",
};

/** What each pipeline stage is doing, in words a reader can act on. */
const STAGE_LABEL: Record<string, string> = {
  input: "Reading the request",
  agents: "Deciding what this is",
  engine: "Querying the chain",
  evidence: "Checking the findings",
  report: "Writing the summary",
};

function ExecutionsLive() {
  const { toast } = useToast();
  const { hasKey } = useCredential();
  const [target, setTarget] = React.useState<string>("auto");
  const [value, setValue] = React.useState("");
  const [open, setOpen] = React.useState(false);

  // Re-fetched when a key appears, since the list is scoped to it — without
  // this, setting up a key leaves the page showing an empty history forever.
  const list = useApi((signal) => api.executions(signal), [hasKey]);
  const live = useLiveAnalysis();

  // Nothing on this page works without a credential, so asking for one is the
  // page rather than an error laid over it.
  if (!hasKey) {
    return <ApiKeyPanel />;
  }

  const needsInput = target !== TAKES_NOTHING;
  const canRun = !live.pending && (!needsInput || value.trim().length > 2);

  const onRun = async (event: React.FormEvent) => {
    event.preventDefault();

    setOpen(true);
    const result = await live.run(target, value.trim());

    if (result) {
      list.refetch();
      toast({
        title:
          result.status === "succeeded"
            ? `Analysis complete in ${result.execution_time_ms} ms`
            : "Execution failed",
        description:
          result.status === "succeeded"
            ? `${result.evidence.length} facts collected from ${describeServices(result.services_called)}.`
            : result.error ?? undefined,
        tone: result.status === "succeeded" ? "success" : "danger",
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* --- Run an analysis --- */}
      <Card className="p-5 sm:p-6">
        <SectionHeader
          title="Run an analysis"
          description="Search for a token, or paste an address. Each run spends one unit of your daily quota."
        />

        {/* Finding the subject comes before analysing it. Nobody arrives with
            a 42-character address; they arrive with a ticker. */}
        <TickerSearch
          className="mt-5"
          onPick={(token) => {
            if (token.address) {
              setTarget("token");
              setValue(token.address);
            }
          }}
        />

        <form onSubmit={onRun} className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <Field label="Target" htmlFor="target">
              <Select
                id="target"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              >
                {TARGETS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label={
                target === "auto" ? "Request" : target === TAKES_URL ? "URL" : "Address"
              }
              htmlFor="value"
              hint={
                target === TAKES_NOTHING
                  ? "A chain overview needs no address."
                  : target === TAKES_URL
                    ? "A domain or full URL. Private and loopback hosts are refused."
                    : target === "auto"
                      ? "Describe what to analyse, or paste a 0x address."
                      : "A 42-character address on Robinhood Chain."
              }
            >
              <Input
                id="value"
                value={value}
                disabled={!needsInput}
                onChange={(event) => setValue(event.target.value)}
                placeholder={
                  target === TAKES_URL
                    ? "robinhood.com"
                    : target === "auto"
                      ? "Analyze token 0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34"
                      : "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34"
                }
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!canRun}>
              {live.pending ? <Spinner /> : <Play aria-hidden="true" />}
              {live.pending ? "Running…" : "Run analysis"}
            </Button>
            {live.result ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(true)}
              >
                View last result
              </Button>
            ) : null}
            {/* Naming the stage turns a spinner into an explanation of what is
                taking the time. */}
            {live.stage ? (
              <span className="font-mono text-[11px] font-bold text-muted">
                {STAGE_LABEL[live.stage] ?? live.stage}…
              </span>
            ) : null}
          </div>

          {live.error ? <InlineError error={live.error} /> : null}
        </form>
      </Card>

      {/* --- History --- */}
      <Card className="p-5 sm:p-6">
        <SectionHeader
          title="Recent executions"
          description={list.data?.persistence}
          actions={
            <Button
              size="sm"
              variant="secondary"
              onClick={list.refetch}
              disabled={list.loading}
            >
              <RefreshCw aria-hidden="true" />
              Refresh
            </Button>
          }
        />

        {list.initialLoading ? (
          <div className="mt-6 flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-11 w-full" />
            ))}
          </div>
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={list.refetch} className="mt-6" />
        ) : !list.data?.items.length ? (
          <EmptyState
            icon={ListChecks}
            title="No executions yet"
            description="Run an analysis above and it will appear here immediately."
            className="mt-6 border-0 bg-transparent"
          />
        ) : (
          <>
            <div className="mt-6 hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Execution</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Agents</TableHead>
                    <TableHead>Facts</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-mono text-xs font-bold whitespace-nowrap">
                        {/* The id is the permalink — every stored run is
                            addressable now that history outlives the process. */}
                        <Link
                          href={`/executions/${record.id}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {record.id.slice(0, 10)}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {record.target ?? "—"}
                        {record.address ? (
                          <span className="ml-2 font-mono text-[10px] text-muted">
                            {shortenAddress(record.address, 4)}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={STATUS_VARIANT[record.status] ?? "default"}
                          dot
                        >
                          {record.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted">
                        {record.agents_used.join(", ") || "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {record.evidence_count}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {record.duration_ms ? `${record.duration_ms} ms` : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted">
                        {formatRelativeTime(record.created_at, new Date())}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="mt-6 flex flex-col gap-3 md:hidden">
              {list.data.items.map((record) => (
                <li
                  key={record.id}
                  className="rounded-lg border border-border bg-surface-raised p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/executions/${record.id}`}
                      className="font-mono text-xs font-bold text-primary underline-offset-4 hover:underline"
                    >
                      {record.id.slice(0, 10)}
                    </Link>
                    <Badge variant={STATUS_VARIANT[record.status] ?? "default"} dot>
                      {record.status}
                    </Badge>
                  </div>
                  <p className="mt-2 truncate text-sm font-bold text-foreground">
                    {record.target ?? "—"} · {record.evidence_count} facts
                  </p>
                  <p className="mt-1 text-xs font-medium text-muted">
                    {record.agents_used.join(", ") || "no agents"} ·{" "}
                    {record.duration_ms ?? "—"} ms
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-w-2xl">
          <DrawerHeader>
            <DrawerTitle>Execution result</DrawerTitle>
            {live.result ? (
              <Link
                href={`/executions/${live.result.execution_id}`}
                className="font-mono text-[10px] font-bold text-muted underline-offset-4 hover:text-foreground hover:underline"
              >
                {live.result.execution_id}
              </Link>
            ) : live.stage ? (
              <p className="font-mono text-[10px] font-bold text-muted">
                {STAGE_LABEL[live.stage] ?? live.stage}…
              </p>
            ) : null}
          </DrawerHeader>
          <DrawerBody>
            {/* The findings render as soon as they exist. Only the summary is
                still being written at that point, and it streams into place. */}
            {live.result ? (
              <AnalysisResult result={live.result as ExecutionResponse} />
            ) : live.preview ? (
              <AnalysisResult
                result={live.preview as ExecutionResponse}
                streamingSummary={live.summary}
              />
            ) : live.pending ? (
              <StageProgress
                current={live.stage}
                completed={live.completed}
              />
            ) : null}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/** Stages already done, and the one running now. */
function StageProgress({
  current,
  completed,
}: {
  current: string | null;
  completed: { stage: string; durationMs: number | null }[];
}) {
  const done = new Set(completed.map((item) => item.stage));

  return (
    <ol className="flex flex-col gap-2">
      {Object.entries(STAGE_LABEL).map(([stage, label]) => {
        const finished = completed.find((item) => item.stage === stage);
        const running = current === stage && !done.has(stage);

        return (
          <li key={stage} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              {running ? (
                <Spinner className="size-3 shrink-0" />
              ) : (
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    finished ? "bg-[#12490F]" : "bg-border-strong",
                  )}
                  aria-hidden="true"
                />
              )}
              <span
                className={cn(
                  "truncate text-sm font-medium",
                  finished || running ? "text-foreground" : "text-muted",
                )}
              >
                {label}
              </span>
            </span>
            <span className="shrink-0 font-mono text-[11px] font-bold text-muted tabular-nums">
              {finished?.durationMs != null ? `${finished.durationMs} ms` : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export { ExecutionsLive };
