"use client";

import * as React from "react";
import {
  Check,
  Download,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Presentation,
  Table2,
} from "lucide-react";

import {
  FORMAT_LABEL,
  approximateSize,
  toBlob,
  type Artifact,
  type ArtifactFormat,
} from "@/lib/ai/artifacts";
import { cn } from "@/lib/utils";

const ICONS: Record<ArtifactFormat, typeof FileText> = {
  md: FileText,
  txt: FileText,
  json: FileCode2,
  csv: Table2,
  html: FileCode2,
  svg: FileImage,
  mermaid: FileImage,
  pdf: FileText,
  docx: FileText,
  xlsx: FileSpreadsheet,
  pptx: Presentation,
};

/**
 * A generated file, offered rather than printed.
 *
 * The content is never rendered into the conversation. A whitepaper pasted
 * into a chat bubble is not a document — it is 4,000 words the reader has to
 * scroll past to reach the next message, and it is the same mistake as
 * printing binary.
 *
 * Conversion happens on click. The libraries that write Office formats are
 * large enough that importing them to *display a card* would slow every page
 * load for a feature most conversations never touch.
 */
function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const [state, setState] = React.useState<"idle" | "working" | "done" | "error">("idle");
  const Icon = ICONS[artifact.format];

  const download = async () => {
    setState("working");
    try {
      const blob = await toBlob(artifact);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = artifact.filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // Revoking immediately can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState("done");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("error");
    }
  };

  return (
    <div className="border-border bg-surface-raised my-3 flex items-center gap-3 rounded-xl border p-3.5">
      <span className="border-border bg-background inline-flex size-10 shrink-0 items-center justify-center rounded-lg border">
        <Icon className="text-primary size-4.5" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-foreground truncate text-[13px] font-bold">{artifact.filename}</p>
        <p className="text-muted mt-0.5 text-[11px] font-medium">
          {FORMAT_LABEL[artifact.format]} · {approximateSize(artifact.content)}
          {state === "error" ? (
            <span className="text-danger"> · could not be generated</span>
          ) : null}
        </p>
      </div>

      <button
        type="button"
        onClick={download}
        disabled={state === "working"}
        className={cn(
          "bg-primary text-background hover:bg-primary-hover inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5",
          "text-[13px] font-bold transition-colors disabled:opacity-60",
        )}
      >
        {state === "working" ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : state === "done" ? (
          <Check className="size-3.5" aria-hidden="true" />
        ) : (
          <Download className="size-3.5" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">
          {state === "working" ? "Preparing" : state === "done" ? "Saved" : "Download"}
        </span>
      </button>
    </div>
  );
}

export { ArtifactCard };
