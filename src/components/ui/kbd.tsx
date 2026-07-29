import * as React from "react";

import { cn } from "@/lib/utils";

/** Keyboard shortcut chip, e.g. ⌘ K. */
function Kbd({ className, children, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-strong/60 bg-foreground/8 px-1.5",
        "font-mono text-[10px] font-bold text-muted",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}

export { Kbd };
