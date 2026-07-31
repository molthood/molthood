"use client";

import * as React from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
  X,
} from "lucide-react";

import {
  FORMAT_LABEL,
  approximateSize,
  parseCsv,
  toBlob,
  type Artifact,
} from "@/lib/ai/artifacts";
import { cn } from "@/lib/utils";

/**
 * A generated file, opened rather than dropped into the downloads folder.
 *
 * The previous version downloaded on click. That is the wrong default: a file
 * you have not read is one you cannot judge, and a whitepaper that lands in
 * `~/Downloads` unseen is less useful than one you can skim in place. So the
 * card opens a workspace, and downloading is a decision made after looking.
 *
 * Editing is local to the panel. The point is not authoring — it is fixing the
 * one wrong figure before exporting, without another round trip to the model.
 */

/** Which formats can be shown as themselves rather than as their source. */
function previewKind(artifact: Artifact): "markdown" | "code" | "table" | "svg" {
  switch (artifact.format) {
    case "svg":
      return "svg";
    case "csv":
    case "xlsx":
      return "table";
    case "md":
    case "pdf":
    case "docx":
    case "pptx":
    case "txt":
      return "markdown";
    default:
      return "code";
  }
}

/**
 * Rows for the preview, using the same quote-aware parser the export does.
 *
 * The first version split on every comma. A quoted cell containing one — which
 * is most prose in a CSV — spilled into a phantom extra column, so the preview
 * showed values under the wrong heading while the downloaded file was correct.
 * A preview that disagrees with the file is worse than no preview.
 */
function parseRows(source: string): string[][] {
  return parseCsv(source).slice(0, 200);
}

function Preview({ artifact }: { artifact: Artifact }) {
  const kind = previewKind(artifact);

  if (kind === "svg") {
    return (
      <div
        className="bg-surface flex items-center justify-center rounded-lg p-4 [&_svg]:max-h-[60vh] [&_svg]:max-w-full"
        // The model wrote this markup and it is rendered here rather than
        // downloaded blind. Same-origin and sandboxed by the page's own policy,
        // which blocks external fetches from anything this could contain.
        dangerouslySetInnerHTML={{ __html: artifact.content }}
      />
    );
  }

  if (kind === "table") {
    const rows = parseRows(artifact.content);
    const [head, ...body] = rows;
    return (
      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="w-full text-[12px]">
          <thead className="bg-surface-raised">
            <tr>
              {(head ?? []).map((cell, index) => (
                <th
                  key={index}
                  className="text-foreground border-border border-b px-3 py-2 text-left font-bold whitespace-nowrap"
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-border/60 border-b last:border-0">
                {row.map((cell, index) => (
                  <td key={index} className="text-muted px-3 py-2 align-top font-medium">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <pre className="border-border bg-surface overflow-x-auto rounded-lg border p-4 text-[12.5px] leading-relaxed whitespace-pre-wrap">
      {artifact.content}
    </pre>
  );
}

export type ArtifactWorkspaceProps = {
  artifact: Artifact;
  onClose: () => void;
  /** Asks the model for another version. Absent when there is nothing to ask. */
  onRegenerate?: () => void;
};

function ArtifactWorkspace({ artifact, onClose, onRegenerate }: ArtifactWorkspaceProps) {
  const [content, setContent] = React.useState(artifact.content);
  const [editing, setEditing] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const edited: Artifact = { ...artifact, content };

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused; the text is still selectable.
    }
  };

  const download = async () => {
    setSaving(true);
    try {
      const blob = await toBlob(edited);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = artifact.filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setSaving(false);
    }
  };

  /** Opens the file in a tab, for the formats a browser can actually show. */
  const openInTab = async () => {
    const blob = await toBlob(edited);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const viewable = ["pdf", "html", "svg", "txt", "md", "json", "csv"].includes(
    artifact.format,
  );

  return (
    <div className="fixed inset-0 z-[70] flex" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close workspace"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
      />

      <div className="border-border bg-background relative ml-auto flex h-full w-full max-w-[46rem] flex-col border-l">
        <header className="border-border flex shrink-0 items-center gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate text-[13px] font-bold">
              {artifact.filename}
            </p>
            <p className="text-muted mt-0.5 text-[11px] font-medium">
              {FORMAT_LABEL[artifact.format]} · {approximateSize(content)}
              {content !== artifact.content ? " · edited" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-md"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {editing ? (
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              spellCheck={false}
              aria-label="Edit file contents"
              className="border-border bg-surface text-foreground h-full min-h-[60vh] w-full resize-none rounded-lg border p-4 font-mono text-[12.5px] leading-relaxed outline-none"
            />
          ) : (
            <Preview artifact={edited} />
          )}
        </div>

        <footer className="border-border flex shrink-0 flex-wrap items-center gap-2 border-t px-4 py-3">
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className="border-border hover:border-border-strong text-foreground inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-bold transition-colors"
          >
            <Pencil className="size-3.5" />
            {editing ? "Preview" : "Edit"}
          </button>

          <button
            type="button"
            onClick={copy}
            className="border-border hover:border-border-strong text-foreground inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-bold transition-colors"
          >
            {copied ? <Check className="text-primary size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>

          {viewable ? (
            <button
              type="button"
              onClick={openInTab}
              className="border-border hover:border-border-strong text-foreground inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-bold transition-colors"
            >
              <ExternalLink className="size-3.5" />
              Open
            </button>
          ) : null}

          {onRegenerate ? (
            <button
              type="button"
              onClick={onRegenerate}
              className="text-muted hover:text-foreground inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-bold transition-colors"
            >
              <RefreshCw className="size-3.5" />
              Regenerate
            </button>
          ) : null}

          <button
            type="button"
            onClick={download}
            disabled={saving}
            className={cn(
              "bg-primary text-background hover:bg-primary-hover ml-auto inline-flex h-9 items-center gap-1.5",
              "rounded-lg px-3.5 text-[13px] font-bold transition-colors disabled:opacity-60",
            )}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            Download
          </button>
        </footer>
      </div>
    </div>
  );
}

export { ArtifactWorkspace };
