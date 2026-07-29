import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocBlocks } from "@/components/docs/blocks";
import { DocsFooterNav, DocsShell } from "@/components/docs/docs-shell";
import { DocsToc } from "@/components/docs/docs-toc";
import {
  docsCategories,
  docsPages,
  findPage,
  headings,
  neighbours,
} from "@/config/docs";
import Link from "next/link";

type Params = { slug: string[] };

/**
 * Every page is generated at build time. The content is data, so the whole
 * documentation site is static — no request does work a build could have.
 */
export function generateStaticParams(): Params[] {
  return [
    // Each category is browsable on its own, so a link to /api lands on the
    // API reference rather than a 404.
    ...docsCategories.map((category) => ({ slug: [category.id] })),
    ...docsPages.map(({ href }) => ({ slug: href.slice(1).split("/") })),
  ];
}

/** A category index: what this group covers, and every page in it. */
function categoryIndex(id: string) {
  return docsCategories.find((category) => category.id === id) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;

  if (slug.length === 1) {
    const category = categoryIndex(slug[0]);
    if (category) {
      return { title: category.title, description: category.description };
    }
  }

  const found = findPage(slug);
  if (!found) return { title: "Not found" };

  return {
    title: found.page.title,
    description: found.page.description,
  };
}

export default async function DocsPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;

  if (slug.length === 1) {
    const category = categoryIndex(slug[0]);
    if (category) {
      return (
        <DocsShell>
          <div className="max-w-[46rem]">
            <h1 className="font-display text-[30px] leading-[1.15] font-bold tracking-[-0.02em] text-foreground sm:text-[34px]">
              {category.title}
            </h1>
            <p className="mt-3 text-[16px] leading-relaxed font-medium text-muted">
              {category.description}
            </p>
            <ul className="mt-8 grid gap-2 sm:grid-cols-2">
              {category.pages.map((entry) => (
                <li key={entry.slug}>
                  <Link
                    href={`/${category.id}/${entry.slug}`}
                    className="flex h-full flex-col rounded-card border border-border bg-surface-raised px-4 py-3 transition-colors hover:border-border-strong"
                  >
                    <span className="text-sm font-bold text-foreground">{entry.title}</span>
                    <span className="mt-1 text-xs leading-relaxed font-medium text-muted">
                      {entry.description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </DocsShell>
      );
    }
  }

  const found = findPage(slug);
  if (!found) notFound();

  const { page, category, href } = found;
  const { previous, next } = neighbours(href);
  const toc = headings(page);

  return (
    <DocsShell toc={<DocsToc headings={toc} />}>
      <article className="max-w-[46rem]">
        <p className="font-mono text-[11px] font-bold tracking-[0.14em] text-primary uppercase">
          {category.title}
        </p>
        <h1 className="mt-3 font-display text-[30px] leading-[1.15] font-bold tracking-[-0.02em] text-foreground sm:text-[34px]">
          {page.title}
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed font-medium text-muted">
          {page.description}
        </p>

        <div className="mt-9">
          <DocBlocks blocks={page.blocks} />
        </div>

        <DocsFooterNav
          previous={previous ? { href: previous.href, title: previous.page.title } : null}
          next={next ? { href: next.href, title: next.page.title } : null}
        />
      </article>
    </DocsShell>
  );
}
