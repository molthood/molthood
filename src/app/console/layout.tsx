import type { Metadata } from "next";
import * as React from "react";

import { ConsoleShell } from "@/components/console/console-shell";

export const metadata: Metadata = {
  title: "Console",
  description: "The Molthood application shell.",
};

export default function ConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
