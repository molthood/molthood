"use client";

import * as React from "react";
import { ExternalLink, HelpCircle, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { HoldingScreen, PortfolioFacts } from "@/lib/api/types";
import { formatUsd, shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

const LEVEL_TONE: Record<string, "success" | "warning" | "danger" | "default"> = {
  low: "success",
  moderate: "warning",
  elevated: "warning",
  high: "danger",
  unscored: "default",
};

/** Reads the portfolio block off a wallet analysis, if it ran. */
function portfolioOf(facts: Record<string, unknown>): PortfolioFacts | null {
  const value = facts.portfolio;
  if (!value || typeof value !== "object") return null;
  const portfolio = value as PortfolioFacts;
  return Array.isArray(portfolio.holdings) ? portfolio : null;
}

/**
 * What this wallet is actually holding, worst position first.
 *
 * The ordering is the feature. Someone opens a wallet report to find the
 * position they should worry about, not to read an inventory — so the row that
 * needs attention is the first one on screen.
 */
function PortfolioCard({
  facts,
  className,
}: {
  facts: Record<string, unknown>;
  className?: string;
}) {
  const portfolio = portfolioOf(facts);
  if (!portfolio) return null;

  const { screened, total_holdings: total, flagged, unscored, skipped } = portfolio;

  return (
    <Card className={cn("p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <Wallet className="size-4 text-primary" aria-hidden="true" />
          <span className="font-display text-[15px] font-bold text-foreground">
            Holdings
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {flagged ? (
            <Badge variant="danger" dot>
              {flagged} need attention
            </Badge>
          ) : null}
          {unscored ? <Badge variant="default">{unscored} unscored</Badge> : null}
          <span className="font-mono text-[10px] font-bold text-muted">
            {screened} of {total} screened
          </span>
        </span>
      </div>

      <p className="mt-1 text-sm font-medium text-muted">
        Each position is scored by the same rules a full token analysis applies.
      </p>

      {portfolio.holdings.length ? (
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {portfolio.holdings.map((holding) => (
            <HoldingRow key={holding.address} holding={holding} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm font-medium text-muted">
          This wallet holds no tokens.
        </p>
      )}

      {/* Naming the unscreened positions is not optional: a reader who sees
          eight rows and no note will assume eight is all there is. */}
      {skipped.length ? (
        <div className="mt-4 flex items-start gap-2 border-t border-border pt-3">
          <HelpCircle className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden="true" />
          <p className="text-xs font-medium text-muted">
            {skipped.length} smaller position
            {skipped.length === 1 ? " was" : "s were"} not screened in this run:{" "}
            {skipped
              .slice(0, 8)
              .map((item) => item.symbol ?? shortenAddress(item.address))
              .join(", ")}
            {skipped.length > 8 ? ", …" : ""}. Analyse them individually to score
            them.
          </p>
        </div>
      ) : null}
    </Card>
  );
}

function HoldingRow({ holding }: { holding: HoldingScreen }) {
  const label = holding.symbol ?? shortenAddress(holding.address);

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-foreground">{label}</span>
            {holding.explorer_url ? (
              <a
                href={holding.explorer_url}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`View ${label} on the explorer`}
                className="shrink-0 text-muted transition-colors hover:text-foreground"
              >
                <ExternalLink className="size-3" />
              </a>
            ) : null}
          </span>
          <span className="truncate text-xs font-medium text-muted">
            {holding.name ?? shortenAddress(holding.address)}
            {holding.value_usd !== null ? ` · ${formatUsd(holding.value_usd)}` : ""}
          </span>
        </span>

        <Badge variant={LEVEL_TONE[holding.level] ?? "default"} className="shrink-0">
          {holding.score === null ? (
            "unscored"
          ) : (
            <>
              {/* "at most" is load-bearing. A screen with a check that did not
                  run can only overstate how safe a position is, and a flat
                  number would hide exactly that. */}
              {holding.is_upper_bound ? "≤ " : ""}
              {holding.score}/100 · {holding.level}
            </>
          )}
        </Badge>
      </div>

      {holding.signals.length ? (
        <ul className="flex flex-col gap-1">
          {holding.signals.map((signal) => (
            <li key={signal.code} className="text-xs font-medium text-muted">
              — {signal.detail}
            </li>
          ))}
        </ul>
      ) : null}

      {holding.checks_missed.length ? (
        <p className="text-xs font-medium text-muted">
          Not checked: {holding.checks_missed.join(", ")}.
          {holding.score === null
            ? " Nothing else fired, so no score is reported."
            : " The real score can only be lower."}
        </p>
      ) : null}

      {holding.error ? (
        <p className="text-xs font-medium text-muted">{holding.error}</p>
      ) : null}
    </li>
  );
}

export { PortfolioCard };
