"use client";

import * as React from "react";
import { PanelLeft, Search } from "lucide-react";

import { Breadcrumbs } from "@/components/console/breadcrumbs";
import { useCommandPalette } from "@/components/console/command-palette";
import { NotificationsMenu } from "@/components/console/notifications-menu";
import { UserMenu } from "@/components/console/user-menu";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

export type ConsoleTopbarProps = {
  onOpenSidebar: () => void;
  className?: string;
};

function ConsoleTopbar({ onOpenSidebar, className }: ConsoleTopbarProps) {
  const { setOpen } = useCommandPalette();

  return (
    <header
      className={cn(
        "molthood-on-dark sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3",
        "border-b border-border bg-background px-4 sm:px-6",
        className,
      )}
    >
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open navigation"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/10 hover:text-foreground lg:hidden"
      >
        <PanelLeft className="size-[18px]" />
      </button>

      <Breadcrumbs className="hidden sm:block" />

      {/*
       * The search field is a button, not an input: typing happens inside the
       * command palette, so there is only ever one search surface.
       */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "ml-auto flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3",
          "text-sm font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground",
          "w-9 justify-center sm:w-56 sm:justify-start lg:w-72",
        )}
        aria-label="Search"
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">Search…</span>
        <span className="ml-auto hidden items-center gap-1 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  );
}

export { ConsoleTopbar };
