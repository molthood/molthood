/**
 * Downloadable files, produced from text the model writes.
 *
 * The model never emits binary. It writes a fenced block tagged with a
 * filename, and the browser turns that text into whatever the extension calls
 * for — a `.docx` is built from markdown, an `.xlsx` from CSV. Two reasons:
 *
 * - **Nothing binary crosses the stream.** A base64 blob in an NDJSON event is
 *   a payload the reader cannot see into, cannot verify, and which breaks the
 *   answer if it is truncated.
 * - **Conversion is deferred.** The libraries that write Office formats are
 *   large, so they are imported when someone clicks Download and not before.
 *   A page nobody downloads from pays nothing for the capability.
 */

export type ArtifactFormat =
  | "md"
  | "txt"
  | "json"
  | "csv"
  | "html"
  | "svg"
  | "mermaid"
  | "pdf"
  | "docx"
  | "xlsx"
  | "pptx";

export type Artifact = {
  filename: string;
  format: ArtifactFormat;
  /** Always text. What it means depends on the format. */
  content: string;
};

const EXTENSIONS: Record<string, ArtifactFormat> = {
  md: "md",
  markdown: "md",
  txt: "txt",
  text: "txt",
  json: "json",
  csv: "csv",
  html: "html",
  htm: "html",
  svg: "svg",
  mmd: "mermaid",
  mermaid: "mermaid",
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  pptx: "pptx",
};

/** What each format wants the model to write. Used by the system prompt. */
export const SOURCE_FOR: Record<ArtifactFormat, string> = {
  md: "markdown",
  txt: "plain text",
  json: "valid JSON",
  csv: "CSV with a header row",
  html: "a complete HTML document",
  svg: "a complete SVG document",
  mermaid: "Mermaid diagram syntax",
  pdf: "markdown — it is converted",
  docx: "markdown — it is converted",
  xlsx: "CSV with a header row — it is converted",
  pptx: "markdown, one slide per `---` separator — it is converted",
};

export const MIME: Record<ArtifactFormat, string> = {
  md: "text/markdown;charset=utf-8",
  txt: "text/plain;charset=utf-8",
  json: "application/json;charset=utf-8",
  csv: "text/csv;charset=utf-8",
  html: "text/html;charset=utf-8",
  svg: "image/svg+xml;charset=utf-8",
  mermaid: "text/plain;charset=utf-8",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export const FORMAT_LABEL: Record<ArtifactFormat, string> = {
  md: "Markdown",
  txt: "Text",
  json: "JSON",
  csv: "CSV",
  html: "HTML",
  svg: "SVG",
  mermaid: "Mermaid",
  pdf: "PDF",
  docx: "Word",
  xlsx: "Excel",
  pptx: "PowerPoint",
};

/**
 * Reads the fence tag a model writes: ```artifact:whitepaper.pdf
 *
 * A filename rather than a format name, because the extension already carries
 * the format and asking for both invites them to disagree.
 */
export function parseArtifactTag(tag: string): { filename: string; format: ArtifactFormat } | null {
  const match = /^artifact:(.+)$/i.exec(tag.trim());
  if (!match) return null;

  const filename = match[1].trim().replace(/[/\\]/g, "-");
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const format = EXTENSIONS[extension];
  if (!format) return null;

  return { filename, format };
}

/* ------------------------------------------------------------------ */
/* Markdown → structure                                                */
/* ------------------------------------------------------------------ */

type Line =
  | { kind: "heading"; level: number; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "text"; text: string };

/** Enough markdown for a document: headings, bullets, paragraphs. */
function readMarkdown(source: string): Line[] {
  const lines: Line[] = [];

  for (const raw of source.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      lines.push({ kind: "heading", level: heading[1].length, text: strip(heading[2]) });
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      lines.push({ kind: "bullet", text: strip(bullet[1]) });
      continue;
    }

    lines.push({ kind: "text", text: strip(line) });
  }

  return lines;
}

/** Inline markers, removed rather than rendered — these are plain documents. */
function strip(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1 ($2)");
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];

  for (const line of source.split("\n")) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cell = "";
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (quoted) {
        // A doubled quote inside a quoted cell is one literal quote.
        if (character === '"' && line[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (character === '"') quoted = false;
        else cell += character;
      } else if (character === '"') quoted = true;
      else if (character === ",") {
        cells.push(cell);
        cell = "";
      } else cell += character;
    }

    cells.push(cell);
    rows.push(cells.map((value) => value.trim()));
  }

  return rows;
}

/* ------------------------------------------------------------------ */
/* Conversion                                                          */
/* ------------------------------------------------------------------ */

async function toPdf(content: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const margin = 56;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const bottom = doc.internal.pageSize.getHeight() - margin;
  let y = margin;

  const advance = (height: number) => {
    if (y + height > bottom) {
      doc.addPage();
      y = margin;
    }
  };

  for (const line of readMarkdown(content)) {
    if (line.kind === "heading") {
      const size = Math.max(20 - line.level * 2, 11);
      doc.setFont("helvetica", "bold").setFontSize(size);
      const wrapped = doc.splitTextToSize(line.text, width) as string[];
      advance(size * 1.6 + 8);
      y += line.level === 1 ? 6 : 12;
      doc.text(wrapped, margin, y);
      y += wrapped.length * size * 1.25 + 6;
      continue;
    }

    doc.setFont("helvetica", "normal").setFontSize(11);
    const text = line.kind === "bullet" ? `•  ${line.text}` : line.text;
    const wrapped = doc.splitTextToSize(text, width) as string[];
    advance(wrapped.length * 15);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 15 + (line.kind === "bullet" ? 2 : 8);
  }

  return doc.output("blob");
}

async function toDocx(content: string): Promise<Blob> {
  const { Document, HeadingLevel, Packer, Paragraph } = await import("docx");

  const HEADINGS = [
    HeadingLevel.HEADING_1,
    HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,
    HeadingLevel.HEADING_5,
    HeadingLevel.HEADING_6,
  ];

  const children = readMarkdown(content).map((line) => {
    if (line.kind === "heading") {
      return new Paragraph({
        text: line.text,
        heading: HEADINGS[Math.min(line.level, 6) - 1],
      });
    }
    if (line.kind === "bullet") {
      return new Paragraph({ text: line.text, bullet: { level: 0 } });
    }
    return new Paragraph({ text: line.text });
  });

  return Packer.toBlob(new Document({ sections: [{ children }] }));
}

async function toXlsx(content: string): Promise<Blob> {
  const XLSX = await import("xlsx");
  const rows = parseCsv(content);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Sheet1");

  const output = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([output], { type: MIME.xlsx });
}

async function toPptx(content: string): Promise<Blob> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const deck = new PptxGenJS();
  deck.layout = "LAYOUT_16x9";

  // A deck is slides, and the model separates them the way markdown does.
  const slides = content
    .split(/^\s*---\s*$/m)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const source of slides) {
    const lines = readMarkdown(source);
    const slide = deck.addSlide();

    const heading = lines.find((line) => line.kind === "heading");
    const body = lines.filter((line) => line !== heading);

    slide.addText(heading?.kind === "heading" ? heading.text : "", {
      x: 0.5,
      y: 0.4,
      w: 9,
      h: 0.9,
      fontSize: 30,
      bold: true,
      color: "111111",
    });

    if (body.length) {
      slide.addText(
        body.map((line) => ({
          text: line.text,
          options: { bullet: line.kind === "bullet", fontSize: 16, color: "333333" },
        })),
        { x: 0.6, y: 1.5, w: 8.8, h: 4.2 },
      );
    }
  }

  return (await deck.write({ outputType: "blob" })) as Blob;
}

/** The bytes for an artifact, built on demand. */
export async function toBlob(artifact: Artifact): Promise<Blob> {
  switch (artifact.format) {
    case "pdf":
      return toPdf(artifact.content);
    case "docx":
      return toDocx(artifact.content);
    case "xlsx":
      return toXlsx(artifact.content);
    case "pptx":
      return toPptx(artifact.content);
    default:
      return new Blob([artifact.content], { type: MIME[artifact.format] });
  }
}

/** Rough size before conversion, for the card. Text formats are exact. */
export function approximateSize(content: string): string {
  const bytes = new TextEncoder().encode(content).length;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
