"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { docsCategories } from "@/config/docs";
import { cn } from "@/lib/utils";

/**
 * The category navigation.
 *
 * Every page is listed, not just the current category's. Documentation is
 * browsed as much as it is searched, and a sidebar that hides its siblings
 * makes a reader guess how much there is.
 */
export function DocsNav({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex flex-col gap-7", className)} aria-label="Documentation">
      {docsCategories.map((category) => (
        <div key={category.id} className="flex flex-col gap-1.5">
          <p className="px-3 text-[11px] font-bold tracking-[0.1em] text-muted uppercase">
            {category.title}
          </p>
          <ul className="flex flex-col">
            {category.pages.map((page) => {
              const href = `/${category.id}/${page.slug}`;
              const active = pathname === href;

              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "-ml-px block border-l py-1.5 pl-3 text-sm font-medium transition-colors",
                      active
                        ? "border-primary font-bold text-primary"
                        : "border-border text-muted hover:border-border-strong hover:text-foreground",
                    )}
                  >
                    {page.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
