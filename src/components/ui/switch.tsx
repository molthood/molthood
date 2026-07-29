import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Toggle built on a native checkbox so it stays form-associated and works
 * with `register()` from React Hook Form without a controller.
 */
function Switch({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <span className="relative inline-flex shrink-0 items-center">
      <input
        type="checkbox"
        role="switch"
        data-slot="switch"
        className={cn(
          "peer h-6 w-10 cursor-pointer appearance-none rounded-full border border-border-strong bg-surface-raised",
          "transition-colors duration-200 checked:border-primary checked:bg-primary",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute left-0.5 size-5 rounded-full bg-background shadow-sm",
          "transition-transform duration-200 ease-out peer-checked:translate-x-4",
          "peer-disabled:opacity-60",
        )}
      />
    </span>
  );
}

export { Switch };
