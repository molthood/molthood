"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { dashboardNav } from "@/config/dashboard";
import { CONSOLE_URL, DOCS_URL, SITE_URL } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * The developer platform shell.
 *
 * Deliberately its own chrome rather than the console's. A developer platform
 * and an application are different products with different navigation, and
 * sharing a shell would have meant every sidebar entry needed a rule about
 * which surface it belonged to.
 */
function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[100rem] items-center gap-3 px-5 sm:px-8">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            className="-ml-1 inline-flex size-8 items-center justify-center rounded-md text-muted lg:hidden"
          >
            <Menu className="size-4" aria-hidden="true" />
          </button>

          {/* The mark carries the wordmark and is the way back to the site —
              the same rule as the console and the docs, so a visitor learns it
              once. The badge names which surface they are on. */}
          <span className="flex min-w-0 items-center gap-2">
            <a href={SITE_URL} className="transition-opacity hover:opacity-80">
              <Logo />
            </a>
            <Link
              href="/"
              className="shrink-0 rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted transition-colors hover:border-border-strong hover:text-foreground"
            >
              Developers
            </Link>
          </span>

          <nav className="ml-auto flex items-center gap-4">
            <a
              href={DOCS_URL}
              className="text-xs font-bold text-muted transition-colors hover:text-foreground"
            >
              Docs
            </a>
            <a
              href={CONSOLE_URL}
              className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-bold text-background transition-opacity hover:opacity-90"
            >
              Open console
            </a>
          </nav>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[100rem] gap-10 px-5 sm:px-8">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 overflow-y-auto py-8 lg:block">
          <Nav pathname={pathname} />
        </aside>

        <main className="min-w-0 flex-1 py-8 lg:py-10">{children}</main>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-foreground/35 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(18rem,84vw)] flex-col border-r border-border-strong bg-surface">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <span className="font-display text-sm font-bold text-foreground">
                Developers
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-raised"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-5">
              <Nav pathname={pathname} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Nav({ pathname }: { pathname: string }) {
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Developer platform">
      {dashboardNav.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-surface-raised font-bold text-foreground"
                : "text-muted hover:bg-surface-raised hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {/* A dot rather than a word: the sidebar is scanned, not read, and
                thirteen "Planned" labels would be noise rather than signal. */}
            {item.status ? <StatusBadge status={item.status} dotOnly /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export { DashboardShell };
