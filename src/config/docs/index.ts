import { apiReference } from "@/config/docs/api";
import { concepts } from "@/config/docs/concepts";
import { faq } from "@/config/docs/faq";
import { gettingStarted } from "@/config/docs/getting-started";
import { guides } from "@/config/docs/guides";
import type { Block, DocCategory, DocPage } from "@/config/docs/types";

export type { Block, DocCategory, DocPage };

/**
 * Every documentation category, in reading order.
 *
 * The sidebar, the previous/next links, the search index, and the static
 * params for every route are all derived from this one array. Adding a page
 * means adding it to a category — there is no second place to register it,
 * which is what stops the navigation and the content drifting apart.
 */
export const docsCategories: DocCategory[] = [
  gettingStarted,
  concepts,
  guides,
  apiReference,
  faq,
];

export type ResolvedPage = {
  page: DocPage;
  category: DocCategory;
  /** Full path under the docs host, e.g. `/concepts/evidence`. */
  href: string;
};

/** Every page, flattened in reading order. */
export const docsPages: ResolvedPage[] = docsCategories.flatMap((category) =>
  category.pages.map((page) => ({
    page,
    category,
    href: `/${category.id}/${page.slug}`,
  })),
);

export function findPage(slug: string[]): ResolvedPage | undefined {
  const href = `/${slug.join("/")}`;
  return docsPages.find((entry) => entry.href === href);
}

/** The pages either side of this one, for the footer navigation. */
export function neighbours(href: string): {
  previous: ResolvedPage | null;
  next: ResolvedPage | null;
} {
  const index = docsPages.findIndex((entry) => entry.href === href);
  if (index === -1) return { previous: null, next: null };
  return {
    previous: docsPages[index - 1] ?? null,
    next: docsPages[index + 1] ?? null,
  };
}

/** The headings on a page, for the "on this page" rail. */
export function headings(page: DocPage): { id: string; content: string }[] {
  return page.blocks.flatMap((block) =>
    block.kind === "heading" ? [{ id: block.id, content: block.content }] : [],
  );
}

export type SearchEntry = {
  href: string;
  title: string;
  category: string;
  description: string;
  /** Everything textual on the page, lowercased once so search does not. */
  haystack: string;
};

/**
 * The search index, built at module scope so it is computed once per build
 * rather than on every keystroke.
 */
export const searchIndex: SearchEntry[] = docsPages.map(({ page, category, href }) => {
  const text = page.blocks
    .map((block) => {
      switch (block.kind) {
        case "text":
        case "heading":
          return block.content;
        case "callout":
          return `${block.title ?? ""} ${block.content}`;
        case "list":
          return block.items.join(" ");
        case "definitions":
          return block.items.map((i) => `${i.term} ${i.description}`).join(" ");
        case "table":
          return [...block.head, ...block.rows.flat()].join(" ");
        case "endpoint":
          return `${block.method} ${block.path} ${block.summary}`;
        case "code":
          // Deliberately included: people search for the endpoint or the field
          // name they saw in a snippet far more often than for prose.
          return `${block.label ?? ""} ${block.content}`;
      }
    })
    .join(" ");

  return {
    href,
    title: page.title,
    category: category.title,
    description: page.description,
    haystack: `${page.title} ${category.title} ${page.description} ${text}`.toLowerCase(),
  };
});
