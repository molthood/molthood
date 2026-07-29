"use client";

import * as React from "react";
import { Check, Copy, KeyRound, LogOut, TriangleAlert } from "lucide-react";

import { InlineError } from "@/components/console/error-state";
import { SectionHeader } from "@/components/console/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/loading-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, useApiAction } from "@/hooks/use-api";
import { useCredential } from "@/hooks/use-credential";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/**
 * Getting, holding, and giving up an API key.
 *
 * Analyses cost real inference credit, which is why a key exists at all. The
 * panel states that outright rather than presenting the allowance as an
 * arbitrary product limit — a reader who understands why the cap is there is
 * far less likely to think the tool is broken when they hit it.
 */
function ApiKeyPanel({ className }: { className?: string }) {
  const { hasKey, setKey } = useCredential();
  const [pasted, setPasted] = React.useState("");
  const [issued, setIssued] = React.useState<string | null>(null);

  const create = useApiAction(async () => api.createKey("Console"));

  const onCreate = async () => {
    const result = await create.run();
    if (result) {
      setKey(result.key);
      // Held in state, not read back from storage, because this is the only
      // moment the secret is visible anywhere. After a reload it is gone.
      setIssued(result.key);
    }
  };

  return (
    <Card className={cn("p-5 sm:p-6", className)}>
      <SectionHeader
        title="API key"
        description="Analyses require a key and are metered against a daily allowance, because each one spends real inference credit."
      />

      {issued ? (
        <NewKeyNotice value={issued} onDismiss={() => setIssued(null)} />
      ) : null}

      {hasKey ? (
        <ActiveKey onSignOut={() => setKey(null)} />
      ) : (
        <div className="mt-5 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted">
              Create one now — no account, no email.
            </p>
            <div>
              <Button onClick={onCreate} disabled={create.pending}>
                {create.pending ? <Spinner /> : <KeyRound aria-hidden="true" />}
                {create.pending ? "Creating…" : "Create a key"}
              </Button>
            </div>
            {create.error ? <InlineError error={create.error} /> : null}
          </div>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
            <span className="text-xs font-bold text-muted">or</span>
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>

          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = pasted.trim();
              if (trimmed) setKey(trimmed);
              setPasted("");
            }}
          >
            <Field
              label="Already have one?"
              htmlFor="api-key"
              hint="Stored in this browser only. It is never sent anywhere except this API."
            >
              <Input
                id="api-key"
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
                placeholder="mk_…"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <div>
              <Button type="submit" variant="secondary" disabled={!pasted.trim()}>
                Use this key
              </Button>
            </div>
          </form>
        </div>
      )}
    </Card>
  );
}

/** Shown once, immediately after creation. */
function NewKeyNotice({
  value,
  onDismiss,
}: {
  value: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the key is on screen regardless.
    }
  };

  return (
    <div className="mt-5 rounded-lg border border-warning/40 bg-warning/5 p-4">
      <span className="flex items-center gap-2">
        <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
        <span className="text-sm font-bold text-foreground">
          Copy this now — it is not shown again
        </span>
      </span>
      <p className="mt-1 text-sm font-medium text-muted">
        The server keeps only a hash of it, so it genuinely cannot be recovered.
        It is already saved in this browser; copy it if you want it elsewhere.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-raised px-3 py-2 font-mono text-xs font-bold text-foreground">
          {value}
        </code>
        <Button size="sm" variant="secondary" onClick={onCopy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Done
        </Button>
      </div>
    </div>
  );
}

/** Quota and usage for the key in use, read from the server. */
function ActiveKey({ onSignOut }: { onSignOut: () => void }) {
  const info = useApi((signal) => api.keyInfo(signal));

  return (
    <div className="mt-5 flex flex-col gap-4">
      {info.initialLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : info.error ? (
        <InlineError error={info.error} />
      ) : info.data ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3">
          <span className="flex min-w-0 flex-col">
            <span className="font-mono text-xs font-bold text-foreground">
              {info.data.hint}
            </span>
            <span className="text-xs font-medium text-muted">
              {info.data.used_today} of {info.data.daily_quota} analyses used
              today
            </span>
          </span>
          <Badge
            variant={
              info.data.remaining === 0
                ? "danger"
                : info.data.remaining <= 5
                  ? "warning"
                  : "success"
            }
            dot
          >
            {info.data.remaining} left
          </Badge>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={onSignOut}>
          <LogOut aria-hidden="true" />
          Forget this key
        </Button>
        <span className="text-xs font-medium text-muted">
          Removes it from this browser. The key itself stays valid.
        </span>
      </div>
    </div>
  );
}

export { ApiKeyPanel };
