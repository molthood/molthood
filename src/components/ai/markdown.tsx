"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

import { ArtifactCard } from "@/components/ai/artifact-card";
import { parseArtifactTag } from "@/lib/ai/artifacts";
import { cn } from "@/lib/utils";

/**
 * Assistant output.
 *
 * `rehype-highlight` rather than a browser-side theme stylesheet: the token
 * classes are plain `hljs-*` names, styled in `globals.css` with the product's
 * own palette. A downloaded theme would have brought its own colours and made
 * code the one region of the page that belongs to somebody else's design.
 */

/**
 * Pulls the fence tag and the raw text back out of the rendered node.
 *
 * `react-markdown` hands `pre` an already-built `code` element rather than the
 * source, so the language lands in `className` and the text in `children`.
 * Reading it back is less pleasant than being given it, but it is the only
 * place both are available together.
 */
function readFence(children: React.ReactNode): { tag: string; text: string } {
  const child = React.Children.toArray(children)[0];
  if (!React.isValidElement(child)) return { tag: "", text: "" };

  const props = child.props as { className?: string; children?: React.ReactNode };
  const tag = /language-([^\s]+)/.exec(props.className ?? "")?.[1] ?? "";

  const flatten = (node: React.ReactNode): string => {
    if (typeof node === "string") return node;
    if (typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(flatten).join("");
    if (React.isValidElement(node)) {
      return flatten((node.props as { children?: React.ReactNode }).children);
    }
    return "";
  };

  return { tag, text: flatten(props.children) };
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLPreElement>(null);
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    const text = ref.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused; the code is still selectable.
    }
  };

  return (
    <div className="group/code relative my-3">
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy code"}
        className={cn(
          "border-border bg-surface text-muted hover:text-foreground hover:border-border-strong",
          "absolute top-2.5 right-2.5 z-10 inline-flex size-7 items-center justify-center rounded-md border",
          "opacity-0 transition-opacity group-hover/code:opacity-100 focus-visible:opacity-100",
        )}
      >
        {copied ? (
          <Check className="text-primary size-3.5" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
      <pre
        ref={ref}
        className="border-border bg-surface overflow-x-auto rounded-xl border p-4 text-[13px] leading-relaxed"
      >
        {children}
      </pre>
    </div>
  );
}

function Markdown({ content }: { content: string }) {
  return (
    <div className="molt-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          // `pre` carries the copy button; `code` inside it must stay bare or
          // the inline styling would fight the block's.
          //
          // A fence tagged `artifact:name.ext` becomes a download instead. The
          // file's contents are never printed into the conversation — a
          // whitepaper pasted into a chat bubble is not a document, it is four
          // thousand words between the reader and the next message.
          pre: ({ children }) => {
            const { tag, text } = readFence(children);
            const spec = tag ? parseArtifactTag(tag) : null;

            if (spec && text.trim()) {
              return (
                <ArtifactCard
                  artifact={{ ...spec, content: text.replace(/\n$/, "") }}
                />
              );
            }

            return <CodeBlock>{children}</CodeBlock>;
          },
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline underline-offset-4 hover:opacity-80"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            // Wide tables scroll inside their own box rather than widening the
            // conversation column on a phone.
            <div className="border-border my-3 overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export { Markdown };
