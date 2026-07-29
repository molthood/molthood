"use client";

import * as React from "react";
import Link from "next/link";
import {
  Eye,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { ApiKeyPanel } from "@/components/console/api-key-panel";
import { EmptyState } from "@/components/console/empty-state";
import { ErrorState, InlineError } from "@/components/console/error-state";
import { SectionHeader } from "@/components/console/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/loading-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useApi, useApiAction } from "@/hooks/use-api";
import { useCredential } from "@/hooks/use-credential";
import { api } from "@/lib/api/client";
import type { AnalysisTarget, Watch } from "@/lib/api/types";
import { formatRelativeTime, shortenAddress } from "@/lib/format";

const TARGETS: { value: AnalysisTarget; label: string }[] = [
  { value: "token", label: "Token" },
  { value: "contract", label: "Contract" },
  { value: "wallet", label: "Wallet" },
  { value: "project", label: "Chain overview" },
];

const INTERVALS = [
  { value: 900, label: "Every 15 minutes" },
  { value: 3600, label: "Every hour" },
  { value: 21_600, label: "Every 6 hours" },
  { value: 86_400, label: "Daily" },
];

/**
 * The watchlist.
 *
 * Change detection has existed for a while and only ever ran when somebody
 * re-analysed a subject by hand — which meant a website that stopped resolving
 * overnight was a finding nobody was present for. This is the surface that
 * closes that loop.
 */
function WatchlistLive() {
  const { toast } = useToast();
  const { hasKey } = useCredential();

  const [target, setTarget] = React.useState<AnalysisTarget>("token");
  const [address, setAddress] = React.useState("");
  const [interval, setInterval] = React.useState(3600);

  const list = useApi((signal) => api.watches(signal), [hasKey]);

  const add = useApiAction(async () =>
    api.watch({
      target,
      address: target === "project" ? null : address.trim(),
      interval_seconds: interval,
    }),
  );

  if (!hasKey) return <ApiKeyPanel />;

  const needsAddress = target !== "project";
  const canAdd = !add.pending && (!needsAddress || address.trim().length > 8);

  const onAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = await add.run();
    if (!result) return;

    setAddress("");
    list.refetch();
    toast({
      title: "Watching",
      description: result.interval_was_floored
        ? `Checked every ${describeInterval(result.interval_seconds)} — the interval you asked for was below this deployment's floor.`
        : `Checked every ${describeInterval(result.interval_seconds)}.`,
      tone: "success",
    });
  };

  const onRemove = async (watch: Watch) => {
    await api.unwatch(watch.id);
    list.refetch();
  };

  const onToggle = async (watch: Watch) => {
    await api.pauseWatch(watch.id, watch.active);
    list.refetch();
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5 sm:p-6">
        <SectionHeader
          title="Watch a subject"
          description="Re-runs the analysis on a schedule and reports what changed. Each check spends one unit of your daily quota."
        />

        <form onSubmit={onAdd} className="mt-5 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr_12rem]">
            <Field label="Target" htmlFor="watch-target">
              <Select
                id="watch-target"
                value={target}
                onChange={(event) =>
                  setTarget(event.target.value as AnalysisTarget)
                }
              >
                {TARGETS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Address"
              htmlFor="watch-address"
              hint={
                needsAddress
                  ? "The subject to keep looking at."
                  : "A chain overview needs no address."
              }
            >
              <Input
                id="watch-address"
                value={address}
                disabled={!needsAddress}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34"
              />
            </Field>

            <Field label="How often" htmlFor="watch-interval">
              <Select
                id="watch-interval"
                value={interval}
                onChange={(event) => setInterval(Number(event.target.value))}
              >
                {INTERVALS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div>
            <Button type="submit" disabled={!canAdd}>
              {add.pending ? <Spinner /> : <Eye aria-hidden="true" />}
              {add.pending ? "Adding…" : "Watch"}
            </Button>
          </div>

          {add.error ? <InlineError error={add.error} /> : null}
        </form>
      </Card>

      <Card className="p-5 sm:p-6">
        <SectionHeader
          title="Watching"
          description={list.data?.note}
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

        {/* A deployment with the monitor switched off would otherwise show a
            list of watches that are silently never checked. */}
        {list.data && !list.data.monitor_running ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0 text-warning"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-foreground">
              Background monitoring is switched off on this deployment. These
              are recorded but nothing is checking them.
            </p>
          </div>
        ) : null}

        {list.initialLoading ? (
          <div className="mt-6 flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={list.refetch} className="mt-6" />
        ) : !list.data?.items.length ? (
          <EmptyState
            icon={Eye}
            title="Nothing is being watched"
            description="Add a subject above. A single analysis is a photograph; a watch is what notices when the picture changes."
            className="mt-6 border-0 bg-transparent"
          />
        ) : (
          <ul className="mt-6 flex flex-col gap-3">
            {list.data.items.map((watch) => (
              <WatchRow
                key={watch.id}
                watch={watch}
                onRemove={() => onRemove(watch)}
                onToggle={() => onToggle(watch)}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function WatchRow({
  watch,
  onRemove,
  onToggle,
}: {
  watch: Watch;
  onRemove: () => void;
  onToggle: () => void;
}) {
  const changes =
    "items" in watch.last_changes ? watch.last_changes : null;
  const alarming = changes?.alarming ?? 0;

  return (
    <li className="rounded-lg border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">{watch.target}</Badge>
            {watch.address ? (
              <span className="font-mono text-xs font-bold text-foreground">
                {shortenAddress(watch.address, 6)}
              </span>
            ) : null}
            {!watch.active ? <Badge variant="default">paused</Badge> : null}
            {alarming ? (
              <Badge variant="danger" dot>
                {alarming} alarming
              </Badge>
            ) : null}
          </span>
          <span className="mt-1 text-xs font-medium text-muted">
            Every {describeInterval(watch.interval_seconds)} ·{" "}
            {watch.checks_run} check{watch.checks_run === 1 ? "" : "s"} ·{" "}
            {/* Never checked is a different state from checked-and-clean, and
                the row has to say which. */}
            {watch.last_checked_at
              ? `last ${formatRelativeTime(watch.last_checked_at, new Date())}`
              : "not checked yet"}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {watch.last_execution_id ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/console/executions/${watch.last_execution_id}`}>
                Last result
              </Link>
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onToggle}>
            {watch.active ? (
              <Pause aria-hidden="true" />
            ) : (
              <Play aria-hidden="true" />
            )}
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove}>
            <Trash2 aria-hidden="true" />
          </Button>
        </span>
      </div>

      {watch.last_error ? (
        <p className="mt-2 text-xs font-medium text-danger">
          Last check did not run: {watch.last_error}
        </p>
      ) : null}

      {changes?.items?.length ? (
        <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-3">
          {changes.items.slice(0, 4).map((item, index) => (
            <li
              key={`${item.kind}-${index}`}
              className="flex items-start gap-2 text-xs font-medium"
            >
              <span
                className={
                  item.severity === "alarming"
                    ? "text-danger"
                    : "text-muted"
                }
              >
                —
              </span>
              <span className="min-w-0 text-foreground">{item.detail}</span>
            </li>
          ))}
        </ul>
      ) : watch.checks_run > 0 ? (
        <p className="mt-2 text-xs font-medium text-muted">
          Nothing material changed at the last check.
        </p>
      ) : null}
    </li>
  );
}

function describeInterval(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86_400) {
    const hours = Math.round(seconds / 3600);
    return hours === 1 ? "hour" : `${hours} hours`;
  }
  const days = Math.round(seconds / 86_400);
  return days === 1 ? "day" : `${days} days`;
}

export { WatchlistLive };
