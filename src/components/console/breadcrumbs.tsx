"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { consoleNav } from "@/config/console";
import { cn } from "@/lib/utils";

type Crumb = { label: string; href: string };

/**
 * Turns a console pathname into labelled crumbs.
 *
 * Paths are read as the visitor sees them — `/agents`, not `/console/agents`.
 * The console is served from its own host, and the `/console` segment the app
 * still uses internally is rewritten away by middleware before this runs.
 */
export function useBreadcrumbs(pathname: string): Crumb[] {
  return React.useMemo(() => {
    const crumbs: Crumb[] = [{ label: "Console", href: "/" }];
    const segments = pathname.split("/").filter(Boolean);

    let href = "";
    for (const segment of segments) {
      href += `/${segment}`;
      const match = consoleNav.find((item) => item.href === href);
      crumbs.push({
        // Fall back to a title-cased segment for routes not in the nav.
        label: match?.label ?? segment.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
        href,
      });
    }

    return crumbs;
  }, [pathname]);
}

function Breadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname();
  const crumbs = useBreadcrumbs(pathname);

  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-1.5">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;

          return (
            <li key={crumb.href} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? (
                <ChevronRight
                  className="size-3.5 shrink-0 text-muted"
                  aria-hidden="true"
                />
              ) : null}
              {isLast ? (
                <span
                  aria-current="page"
                  className="truncate text-sm font-bold text-foreground"
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="shrink-0 text-sm font-semibold text-muted transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export { Breadcrumbs };
