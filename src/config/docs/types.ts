/**
 * The documentation content model.
 *
 * Pages are **data**, not JSX. That is what lets one renderer produce the
 * sidebar, the "on this page" list, previous/next links, and the search index
 * from the same source — none of which can be derived from prose written by
 * hand into a component.
 *
 * The trade is that prose gets a small inline syntax rather than full markdown.
 * It covers bold, code, and links, which is what technical writing actually
 * uses; anything richer is a block of its own.
 */

export type Block =
  /** A paragraph. Supports `code`, **bold**, and [links](/docs/x). */
  | { kind: "text"; content: string }
  /** A section heading. Its `id` anchors the URL and the page's TOC entry. */
  | { kind: "heading"; id: string; content: string }
  | { kind: "code"; label?: string; content: string }
  | { kind: "list"; items: string[]; ordered?: boolean }
  /** A definition list — a term and what it means. Reads better than a table
   *  for two columns where the second is a sentence. */
  | { kind: "definitions"; items: { term: string; description: string }[] }
  | {
      kind: "callout";
      tone: "note" | "warning" | "danger";
      title?: string;
      content: string;
    }
  | { kind: "table"; head: string[]; rows: string[][] }
  /** One HTTP route, rendered as a signature with its auth requirement. */
  | {
      kind: "endpoint";
      method: "GET" | "POST" | "DELETE";
      path: string;
      auth: "required" | "none" | "admin";
      summary: string;
    };

export type DocPage = {
  /** Path under /docs. Empty string is the docs home. */
  slug: string;
  title: string;
  /** One sentence. Used on cards, in search results, and as the meta tag. */
  description: string;
  blocks: Block[];
};

export type DocCategory = {
  id: string;
  title: string;
  /** Why this group exists, shown on the docs home. */
  description: string;
  pages: DocPage[];
};
