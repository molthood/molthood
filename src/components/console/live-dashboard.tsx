"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Blocks,
  Coins,
  Fuel,
  RefreshCw,
  Timer,
  Users,
  Wallet,
} from "lucide-react";

import { ErrorState, InlineError } from "@/components/console/error-state";
import { SectionHeader } from "@/components/console/section-header";
import { Reveal } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { api } from "@/lib/api/client";
import type { DependencyStatus } from "@/lib/api/types";
import { formatCompact, formatNumber, formatUsd, shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

const DEPENDENCY_TONE: Record<
  DependencyStatus["state"],
  { variant: "success" | "warning" | "danger" | "default"; label: string }
> = {
  live: { variant: "success", label: "Live" },
  not_configured: { variant: "warning", label: "No key" },
  unavailable: { variant: "danger", label: "Unreachable" },
  configured: { variant: "default", label: "Configured" },
};

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Blocks;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] font-bold tracking-[0.12em] text-muted uppercase">
          {label}
        </p>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-raised text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-4 font-display text-2xl leading-none font-bold text-foreground tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="mt-2 truncate text-xs font-medium text-muted">{hint}</p>
      ) : null}
    </Card>
  );
}

function LiveDashboard() {
  const stats = useApi((signal) => api.chainStats(signal));
  const status = useApi((signal) => api.status(signal));
  const tokens = useApi((signal) => api.chainTokens(6, undefined, signal));

  const refreshAll = React.useCallback(() => {
    stats.refetch();
    status.refetch();
    tokens.refetch();
  }, [stats, status, tokens]);

  if (stats.initialLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
        <Card className="p-6">
          <Skeleton className="h-4 w-40" />
          <div className="mt-6 flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (stats.error) {
    return <ErrorState error={stats.error} onRetry={refreshAll} />;
  }

  const network = stats.data?.network;
  const market = stats.data?.market;
  const executions = stats.data?.executions;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success" dot>
            {stats.data?.chain.name} · id {stats.data?.chain.id}
          </Badge>
          {network?.head_block ? (
            <Badge variant="outline">
              Head block {formatNumber(network.head_block)}
            </Badge>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={refreshAll}
          disabled={stats.loading}
        >
          <RefreshCw
            className={cn(stats.loading && "animate-spin")}
            aria-hidden="true"
          />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          label="Total Blocks"
          value={formatCompact(network?.total_blocks)}
          hint={`Avg block time ${network?.average_block_time_ms ?? "—"} ms`}
          icon={Blocks}
        />
        <StatTile
          label="Transactions Today"
          value={formatCompact(network?.transactions_today)}
          hint={`${formatCompact(network?.total_transactions)} all time`}
          icon={Activity}
        />
        <StatTile
          label="Total Addresses"
          value={formatCompact(network?.total_addresses)}
          hint="Unique addresses seen on chain"
          icon={Users}
        />
        <StatTile
          label="Gas Price"
          value={
            network?.gas_prices_gwei?.average
              ? `${network.gas_prices_gwei.average} gwei`
              : "—"
          }
          hint={
            network?.gas_prices_gwei
              ? `slow ${network.gas_prices_gwei.slow} · fast ${network.gas_prices_gwei.fast}`
              : undefined
          }
          icon={Fuel}
        />
        <StatTile
          label="ETH Price"
          value={formatUsd(market?.coin_price_usd)}
          hint={`Market cap ${formatUsd(market?.market_cap_usd)}`}
          icon={Coins}
        />
        <StatTile
          label="Executions This Session"
          value={formatNumber(executions?.total ?? 0)}
          hint={
            executions?.total
              ? `${executions.success_rate}% success · avg ${executions.avg_duration_ms} ms`
              : "Run an analysis to populate this"
          }
          icon={Timer}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Reveal immediate className="lg:col-span-2">
          <Card className="h-full p-5 sm:p-6">
            <SectionHeader
              title="Tracked Tokens"
              description="Live token data from the Robinhood Chain explorer."
              actions={
                <Button asChild size="sm" variant="ghost">
                  <Link href="/console/executions">Analyze one</Link>
                </Button>
              }
            />

            {tokens.initialLoading ? (
              <div className="mt-6 flex flex-col gap-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : tokens.error ? (
              <InlineError error={tokens.error} className="mt-6" />
            ) : (
              <ul className="mt-6 flex flex-col divide-y divide-border">
                {tokens.data?.items.map((token) => (
                  <li
                    key={token.address ?? token.symbol}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-raised font-mono text-[10px] font-bold text-primary">
                      {(token.symbol ?? "?").slice(0, 3)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-foreground">
                        {token.name ?? "Unnamed token"}
                      </span>
                      <span className="block truncate font-mono text-[10px] font-bold text-muted">
                        {shortenAddress(token.address)}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right sm:block">
                      <span className="block text-sm font-bold text-foreground tabular-nums">
                        {formatUsd(token.price_usd)}
                      </span>
                      <span className="block text-[11px] font-semibold text-muted tabular-nums">
                        {formatCompact(token.holders)} holders
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Reveal>

        <Reveal immediate delay={0.06}>
          <Card className="h-full p-5 sm:p-6">
            <SectionHeader
              title="Service Health"
              description="Probed live, not cached from config."
            />

            {status.initialLoading ? (
              <div className="mt-6 flex flex-col gap-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : status.error ? (
              <InlineError error={status.error} className="mt-6" />
            ) : (
              <>
                <ul className="mt-6 flex flex-col gap-2">
                  {status.data?.dependencies.map((dependency) => {
                    const tone = DEPENDENCY_TONE[dependency.state];
                    return (
                      <li
                        key={dependency.name}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2.5"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-foreground">
                            {dependency.name.replace(/_/g, " ")}
                          </span>
                          <span className="block truncate text-[11px] font-medium text-muted">
                            {dependency.detail}
                          </span>
                        </span>
                        <Badge variant={tone.variant} dot className="shrink-0">
                          {tone.label}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>

                <Button asChild variant="secondary" className="mt-5 w-full">
                  <Link href="/console/agents">
                    View agents
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </>
            )}
          </Card>
        </Reveal>
      </div>

      <p className="flex items-center gap-2 text-xs font-medium text-muted">
        <Wallet className="size-3.5 shrink-0" aria-hidden="true" />
        Every figure above is read live from Robinhood Chain. Nothing on this page
        is stored — refresh re-queries the explorer and RPC.
      </p>
    </div>
  );
}

export { LiveDashboard };
