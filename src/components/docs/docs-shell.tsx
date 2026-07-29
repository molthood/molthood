"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { DocsNav } from "@/components/docs/docs-sidebar";
import { DocsSearch } from "@/components/docs/docs-search";
import { cn } from "@/lib/utils";

/**
 * Two rails around the content: navigation on the left, "on this page" on the
 * right. Both collapse below `xl`, where the reading column needs the width
 * more than the wayfinding does.
 */
export function DocsShell({
  toc,
  children,
}: {
  toc?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  // A route change must close the drawer, or navigating from inside it leaves
  // the reader looking at the menu they just used.
  React.useEffect(() => setOpen(false), [pathname]);

  React.useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="mx-auto w-full max-w-[100rem] px-5 sm:px-8">
      {/* Mobile bar: search plus the drawer trigger. */}
      <div className="sticky top-14 z-30 -mx-5 flex items-center gap-3 border-b border-border bg-background/90 px-5 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs font-bold text-foreground"
          aria-label="Open documentation navigation"
        >
          <Menu className="size-3.5" aria-hidden="true" />
          Contents
        </button>
        <DocsSearch className="min-w-0 flex-1" />
      </div>

      <div className="flex gap-10">
        <aside className="sticky top-24 hidden h-[calc(100dvh-8rem)] w-60 shrink-0 flex-col gap-6 overflow-y-auto py-10 lg:flex">
          <DocsSearch />
          <DocsNav />
        </aside>

        <div className="min-w-0 flex-1 py-8 lg:py-10">{children}</div>

        {toc ? (
          <aside className="sticky top-24 hidden h-fit w-56 shrink-0 py-10 xl:block">
            {toc}
          </aside>
        ) : null}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-foreground/35 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col border-r border-border-strong bg-surface">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <span className="font-display text-sm font-bold text-foreground">
                Documentation
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-raised hover:text-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-5">
              <DocsNav onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DocsFooterNav({
  previous,
  next,
}: {
  previous: { href: string; title: string } | null;
  next: { href: string; title: string } | null;
}) {
  if (!previous && !next) return null;

  return (
    <nav
      className={cn("mt-14 grid gap-3 border-t border-border pt-8 sm:grid-cols-2")}
      aria-label="Previous and next page"
    >
      {previous ? (
        <a
          href={previous.href}
          className="rounded-card border border-border px-4 py-3 transition-colors hover:border-border-strong"
        >
          <span className="text-[11px] font-bold tracking-wide text-muted uppercase">
            Previous
          </span>
          <span className="mt-1 block text-sm font-bold text-foreground">
            {previous.title}
          </span>
        </a>
      ) : (
        <span />
      )}
      {next ? (
        <a
          href={next.href}
          className="rounded-card border border-border px-4 py-3 text-right transition-colors hover:border-border-strong sm:col-start-2"
        >
          <span className="text-[11px] font-bold tracking-wide text-muted uppercase">
            Next
          </span>
          <span className="mt-1 block text-sm font-bold text-foreground">{next.title}</span>
        </a>
      ) : null}
    </nav>
  );
}
