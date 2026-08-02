"use client";

import * as React from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
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
    // Loaded through `<img>`, never injected into the document.
    //
    // The previous version used `dangerouslySetInnerHTML`. `<script>` does not
    // execute through `innerHTML`, which is what made it look safe — but event
    // handlers do, and `<image href="x" onerror="…">` fires. Verified: both
    // that and a `foreignObject` image handler ran. Since the SVG is written
    // by a model that reads attacker-controlled text (a token name, a webpage
    // it was asked to research), that is a path from a hostile listing to
    // arbitrary script on this origin — with every stored conversation in
    // `localStorage` behind it.
    //
    // An `<img>` renders SVG in the spec's secure static mode: no scripting,
    // no external references, no same-origin access. The browser enforces it,
    // so there is no sanitiser to keep current.
    const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artifact.content)}`;
    return (
      <div className="bg-surface flex items-center justify-center rounded-lg p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={source}
          alt={artifact.filename}
          className="max-h-[60vh] max-w-full object-contain"
        />
      </div>
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
  // A deck or a long report needs the width; a CSV rarely does. Which is why
  // this is a control rather than a breakpoint.
  const [full, setFull] = React.useState(false);

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

  // `html` and `svg` are excluded deliberately. Opening either as a blob gives
  // model-written markup a real browsing context, and the preview above
  // already shows them safely — there is nothing to gain and a script engine
  // to lose.
  const viewable = ["pdf", "txt", "md", "json", "csv"].includes(artifact.format);

  return (
    <div className="fixed inset-0 z-[70] flex" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close workspace"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
      />

      <div
        className={cn(
          "border-border bg-background relative ml-auto flex h-full w-full flex-col border-l",
          full ? "max-w-none" : "max-w-[46rem]",
        )}
      >
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
            onClick={() => setFull((value) => !value)}
            aria-label={full ? "Exit fullscreen" : "Fullscreen"}
            className="text-muted hover:text-foreground hidden size-8 shrink-0 items-center justify-center rounded-md sm:inline-flex"
          >
            {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
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
