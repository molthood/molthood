/**
 * Molthood's own documentation, searchable by the agent.
 *
 * The reason this exists: asked "what is on the Molthood roadmap", a model
 * answers from training data it does not have, and produces a confident,
 * plausible, entirely invented roadmap. That is the single most embarrassing
 * failure available to a product whose argument is that it does not invent
 * things.
 *
 * So questions about Molthood are answered from Molthood. The corpus is the
 * same data that renders the documentation site and the roadmap page — not a
 * copy, not a summary. A page cannot drift out of sync with itself.
 */

import { docsPages } from "@/config/docs";
import type { Block } from "@/config/docs/types";
import { PHASE_ORDER, itemsInPhase } from "@/config/roadmap";
import { DOCS_URL, siteConfig } from "@/config/site";

export type KnowledgeHit = {
  title: string;
  section: string;
  url: string;
  excerpt: string;
};

/** Blocks flattened to searchable prose. */
function textOf(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.kind) {
        case "text":
        case "heading":
        case "code":
          return block.content;
        case "callout":
          return `${block.title ?? ""} ${block.content}`;
        case "list":
          return block.items.join(" ");
        case "definitions":
          return block.items.map((item) => `${item.term}: ${item.description}`).join(" ");
        case "table":
          return [block.head.join(" "), ...block.rows.map((row) => row.join(" "))].join(" ");
        case "endpoint":
          return `${block.method} ${block.path} ${block.summary}`;
      }
    })
    .join("\n");
}

type Document = { title: string; section: string; url: string; body: string };

/**
 * The corpus, built once.
 *
 * The roadmap is included as a document of its own rather than left to its
 * rendered page, because "what is coming next" is the most likely question and
 * its answer is structured data that deserves to be matched directly.
 */
let corpus: Document[] | null = null;

function build(): Document[] {
  if (corpus) return corpus;

  const documents: Document[] = docsPages.map(({ page, category, href }) => ({
    title: page.title,
    section: category.title,
    url: `${DOCS_URL}${href}`,
    body: `${page.title}\n${page.description}\n${textOf(page.blocks)}`,
  }));

  documents.push({
    title: "Roadmap status",
    section: "Roadmap",
    url: `${DOCS_URL}/roadmap`,
    body: PHASE_ORDER.map((phase) => {
      const items = itemsInPhase(phase);
      if (!items.length) return "";
      return `${phase}: ${items
        .map((item) => `${item.title} — ${item.description} Why: ${item.why}`)
        .join(" | ")}`;
    })
      .filter(Boolean)
      .join("\n"),
  });

  documents.push({
    title: "What Molthood is",
    section: "Overview",
    url: siteConfig.url,
    body: `${siteConfig.name}. ${siteConfig.tagline} ${siteConfig.description} Chain: ${siteConfig.chain}.`,
  });

  corpus = documents;
  return corpus;
}

const STOP = new Set([
  "the", "a", "an", "is", "are", "of", "to", "and", "for", "in", "on", "what",
  "how", "does", "do", "it", "this", "that", "with", "can", "i", "you",
]);

function terms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
}

/**
 * Scores by how many query terms appear and how often.
 *
 * Deliberately simple. A real index would be better and is not warranted for
 * forty documents — and a wrong ranking here costs a slightly less relevant
 * excerpt, not a wrong answer, because the model reads what it is given.
 */
export function searchKnowledge(query: string, limit = 4): KnowledgeHit[] {
  const words = terms(query);
  if (words.length === 0) return [];

  const scored = build().map((document) => {
    const haystack = document.body.toLowerCase();
    const title = document.title.toLowerCase();

    let score = 0;
    for (const word of words) {
      const hits = haystack.split(word).length - 1;
      score += hits;
      // A term in the title is worth far more than one buried in the body.
      if (title.includes(word)) score += 12;
    }
    return { document, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ document }) => ({
      title: document.title,
      section: document.section,
      url: document.url,
      // Generous: the model needs the substance, and these documents are the
      // one source it is not allowed to paraphrase from memory.
      excerpt: document.body.slice(0, 2400),
    }));
}
