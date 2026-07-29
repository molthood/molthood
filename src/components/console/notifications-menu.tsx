"use client";

import * as React from "react";
import { Bell, BellOff } from "lucide-react";

import { Dropdown, DropdownContent, DropdownTrigger } from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * Notification delivery is not part of this phase, and the console now shows
 * live data everywhere else — so this renders an honest empty state rather
 * than a list of invented alerts sitting next to real chain figures.
 */
function NotificationsMenu() {
  return (
    <Dropdown>
      <Tooltip content="Notifications">
        <DropdownTrigger asChild>
          <button
            type="button"
            aria-label="Notifications"
            className="relative inline-flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <Bell className="size-[18px]" />
          </button>
        </DropdownTrigger>
      </Tooltip>

      <DropdownContent className="w-80 p-0">
        <div className="border-b border-border px-3.5 py-2.5">
          <p className="text-sm font-bold text-foreground">Notifications</p>
        </div>

        <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
          <BellOff className="size-5 text-muted" aria-hidden="true" />
          <p className="text-sm font-bold text-foreground">Nothing to show</p>
          <p className="text-xs leading-relaxed font-medium text-muted">
            Execution notifications are delivered once webhooks and email are
            connected. Until then, watch runs live on the Executions page.
          </p>
        </div>
      </DropdownContent>
    </Dropdown>
  );
}

export { NotificationsMenu };
