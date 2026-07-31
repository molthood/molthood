"use client";

import * as React from "react";
import {
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Maximize2,
  Presentation,
  Table2,
} from "lucide-react";

import { ArtifactWorkspace } from "@/components/ai/artifact-workspace";

import {
  FORMAT_LABEL,
  approximateSize,
  type Artifact,
  type ArtifactFormat,
} from "@/lib/ai/artifacts";

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
 * Clicking opens a workspace rather than downloading. A file you have not read
 * is one you cannot judge, and a document that lands unseen in a downloads
 * folder is less useful than one you can skim in place.
 */
function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const [open, setOpen] = React.useState(false);
  const Icon = ICONS[artifact.format];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border bg-surface-raised hover:border-border-strong my-3 flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors"
      >
        <span className="border-border bg-background inline-flex size-10 shrink-0 items-center justify-center rounded-lg border">
          <Icon className="text-primary size-4.5" aria-hidden="true" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="text-foreground block truncate text-[13px] font-bold">
            {artifact.filename}
          </span>
          <span className="text-muted mt-0.5 block text-[11px] font-medium">
            {FORMAT_LABEL[artifact.format]} · {approximateSize(artifact.content)}
          </span>
        </span>

        <span className="border-border text-foreground inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-bold">
          <Maximize2 className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Open</span>
        </span>
      </button>

      {open ? (
        <ArtifactWorkspace artifact={artifact} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

export { ArtifactCard };
