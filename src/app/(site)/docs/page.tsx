import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { DocsShell } from "@/components/docs/docs-shell";
import { docsCategories, docsPages } from "@/config/docs";
import { DOCS_URL, siteConfig } from "@/config/site";
import { OG_DOCS, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Documentation",
  description: `How Molthood analyses ${siteConfig.chain}: concepts, guides, and the full API reference.`,
  url: DOCS_URL,
  image: OG_DOCS,
});

export default function DocsHome() {
  return (
    <DocsShell>
      <div className="max-w-[46rem]">
        <h1 className="font-display text-[32px] leading-[1.12] font-bold tracking-[-0.02em] text-foreground sm:text-[38px]">
          Documentation
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed font-medium text-muted">
          Molthood analyses tokens, wallets, contracts, and websites on{" "}
          {siteConfig.chain}, and reports what it could <em>not</em> check as
          carefully as what it could. {docsPages.length} pages, all of them
          describing the system as it actually is.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/getting-started/quickstart"
            className="inline-flex items-center gap-2 bg-primary text-background hover:bg-primary-hover rounded-lg px-4 py-2.5 text-sm font-bold transition-colors"
          >
            Quickstart
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
          <Link
            href="/api/conventions"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:border-border-strong"
          >
            API reference
          </Link>
        </div>

        <div className="mt-12 flex flex-col gap-8">
          {docsCategories.map((category) => (
            <section key={category.id}>
              <h2 className="font-display text-[17px] font-bold text-foreground">
                {category.title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed font-medium text-muted">
                {category.description}
              </p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {category.pages.map((page) => (
                  <li key={page.slug}>
                    <Link
                      href={`/${category.id}/${page.slug}`}
                      className="flex h-full flex-col rounded-card border border-border bg-surface-raised px-4 py-3 transition-colors hover:border-border-strong"
                    >
                      <span className="text-sm font-bold text-foreground">
                        {page.title}
                      </span>
                      <span className="mt-1 line-clamp-2 text-xs leading-relaxed font-medium text-muted">
                        {page.description}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </DocsShell>
  );
}
