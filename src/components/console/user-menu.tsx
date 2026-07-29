"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpen, LogOut, Settings, SunMoon, UserRound } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { useToast } from "@/components/ui/toast";
import { currentUser, workspace } from "@/data/workspace";

function UserMenu() {
  const { toast } = useToast();

  const notImplemented = (label: string) =>
    toast({
      title: `${label} is not available yet`,
      description: "Accounts arrive with authentication in a later phase.",
      tone: "info",
    });

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="inline-flex items-center gap-2 rounded-full p-0.5 transition-opacity hover:opacity-80"
        >
          <Avatar initials={currentUser.initials} />
        </button>
      </DropdownTrigger>

      <DropdownContent className="w-64">
        <div className="flex items-center gap-3 px-2.5 py-2.5">
          <Avatar initials={currentUser.initials} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">
              {currentUser.name}
            </p>
            <p className="truncate text-xs font-medium text-muted">
              {currentUser.email}
            </p>
          </div>
        </div>

        <DropdownSeparator />

        <DropdownLabel>{workspace.name}</DropdownLabel>
        <DropdownItem asChild>
          <Link href="/console/settings">
            <UserRound />
            Profile
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href="/console/settings">
            <Settings />
            Workspace settings
          </Link>
        </DropdownItem>
        <DropdownItem onSelect={() => notImplemented("Appearance")}>
          <SunMoon />
          Appearance
        </DropdownItem>

        <DropdownSeparator />

        <DropdownItem asChild>
          <Link href="/docs">
            <BookOpen />
            Documentation
          </Link>
        </DropdownItem>
        <DropdownItem onSelect={() => notImplemented("Sign out")}>
          <LogOut />
          Sign out
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

export { UserMenu };
