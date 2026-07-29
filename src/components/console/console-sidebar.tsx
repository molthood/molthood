"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { consoleNav } from "@/config/console";
import { siteConfig } from "@/config/site";
import { workspace } from "@/data/workspace";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  if (href === "/console") return pathname === "/console";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export type ConsoleSidebarProps = React.ComponentProps<"aside">;

function ConsoleSidebar({ className, ...props }: ConsoleSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex w-64 shrink-0 flex-col border-r border-border bg-surface",
        className,
      )}
      {...props}
    >
      <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <Logo />
        </Link>
      </div>

      <div className="border-b border-border px-3 py-3">
        <div className="rounded-lg border border-border bg-surface-raised px-3 py-2.5">
          <p className="truncate text-xs font-bold text-foreground">{workspace.name}</p>
          <p className="mt-1 truncate font-mono text-[10px] font-bold text-muted">
            {workspace.plan}
          </p>
        </div>
      </div>

      <nav aria-label="Console" className="flex-1 overflow-y-auto px-3 py-3">
        <ul className="flex flex-col gap-0.5">
          {consoleNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold",
                    "transition-colors duration-150",
                    active
                      ? "bg-surface-raised text-foreground"
                      : "text-muted hover:bg-surface-raised/60 hover:text-foreground",
                  )}
                >
                  {active ? (
                    <span
                      className="absolute inset-y-1.5 -left-3 w-0.5 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                  ) : null}
                  <Icon
                    className={cn(
                      "size-4 shrink-0 transition-colors",
                      active ? "text-primary" : "text-muted group-hover:text-foreground",
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <Link
          href={siteConfig.links.docs}
          className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
        >
          Documentation
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
        <div className="mt-2 px-3 py-1">
          <Badge variant="success" dot>
            {workspace.network}
          </Badge>
        </div>
      </div>
    </aside>
  );
}

export { ConsoleSidebar };
