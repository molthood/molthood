"use client";

import * as React from "react";
import Link from "next/link";
import { FolderKanban, RefreshCw, Repeat, TriangleAlert } from "lucide-react";

import { ApiKeyPanel } from "@/components/console/api-key-panel";
import { EmptyState } from "@/components/console/empty-state";
import { ErrorState } from "@/components/console/error-state";
import { SectionHeader } from "@/components/console/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { useCredential } from "@/hooks/use-credential";
import { api } from "@/lib/api/client";
import type { RiskAssessment, Subject } from "@/lib/api/types";
import { formatRelativeTime, shortenAddress } from "@/lib/format";

const RISK_TONE: Record<
  RiskAssessment["level"],
  "success" | "warning" | "danger"
> = {
  low: "success",
  moderate: "warning",
  elevated: "warning",
  high: "danger",
};

/**
 * Everything this key has analysed, grouped by subject.
 *
 * Derived from executions rather than stored separately, which is why this
 * page has content at all: a "project" nobody has to create and name is a
 * grouping that already exists in the data. A subject that has been looked at
 * more than once is the interesting case — it is the only one where "what
 * changed" is a question with an answer.
 */
function SubjectsLive() {
  const { hasKey } = useCredential();
  const subjects = useApi((signal) => api.subjects(signal), [hasKey]);

  if (!hasKey) return <ApiKeyPanel />;

  const items = subjects.data?.items ?? [];
  const revisited = subjects.data?.revisited ?? 0;

  return (
    <Card className="p-5 sm:p-6">
      <SectionHeader
        title="Subjects"
        description={
          subjects.data
            ? `${subjects.data.total} analysed · ${revisited} looked at more than once.`
            : undefined
        }
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={subjects.refetch}
            disabled={subjects.loading}
          >
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      {subjects.initialLoading ? (
        <div className="mt-6 flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : subjects.error ? (
        <ErrorState
          error={subjects.error}
          onRetry={subjects.refetch}
          className="mt-6"
        />
      ) : !items.length ? (
        <EmptyState
          icon={FolderKanban}
          title="Nothing analysed yet"
          description="Every subject you analyse is grouped here automatically — no setting up required. Run something and it appears, with its latest score and whatever changed since the run before."
          action={
            <Button asChild>
              <Link href="/executions">Run an analysis</Link>
            </Button>
          }
          className="mt-6 border-0 bg-transparent"
        />
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {items.map((subject) => (
            <SubjectRow
              key={`${subject.target}-${subject.address ?? "chain"}`}
              subject={subject}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function SubjectRow({ subject }: { subject: Subject }) {
  return (
    <li>
      <Link
        href={`/executions/${subject.last_execution_id}`}
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3.5 transition-colors hover:border-border-strong"
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">{subject.target}</Badge>
            {subject.address ? (
              <span className="font-mono text-xs font-bold text-foreground">
                {shortenAddress(subject.address, 6)}
              </span>
            ) : null}
            {subject.runs > 1 ? (
              <span className="flex items-center gap-1 font-mono text-[10px] font-bold text-muted">
                <Repeat className="size-3" aria-hidden="true" />
                {subject.runs} runs
              </span>
            ) : null}
            {subject.alarming ? (
              <Badge variant="danger" dot>
                {subject.alarming} alarming
              </Badge>
            ) : null}
          </span>
          <span className="text-xs font-medium text-muted">
            {subject.findings} findings · last checked{" "}
            {formatRelativeTime(subject.last_seen, new Date())}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-3">
          {subject.changes ? (
            <span className="flex items-center gap-1 font-mono text-[10px] font-bold text-muted">
              <TriangleAlert className="size-3" aria-hidden="true" />
              {subject.changes} changed
            </span>
          ) : null}
          {/* A score is only shown when one was produced, and never without
              its level: the scale runs the opposite way to the intuition —
              88 is safe, not alarming — so the number alone can be read
              backwards. A subject nobody scored shows nothing rather than a
              zero, which would read as the worst possible result. */}
          {subject.risk_score !== null && subject.risk_level ? (
            <Badge variant={RISK_TONE[subject.risk_level]} dot>
              {subject.risk_score}/100 · {subject.risk_level}
            </Badge>
          ) : (
            <span className="font-mono text-[10px] font-bold text-muted">
              unscored
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

export { SubjectsLive };
