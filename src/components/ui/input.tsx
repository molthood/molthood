import * as React from "react";

import { cn } from "@/lib/utils";

const controlClasses = cn(
  "w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground",
  "font-medium placeholder:font-normal placeholder:text-muted/70 transition-colors duration-150",
  "hover:border-border-strong focus-visible:border-foreground",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-danger/70",
);

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(controlClasses, "h-10", className)}
      {...props}
    />
  );
}

function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(controlClasses, "h-10 appearance-none pr-8", className)}
      {...props}
    >
      {children}
    </select>
  );
}

function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        "size-4 shrink-0 cursor-pointer appearance-none rounded border border-border bg-surface",
        "checked:border-primary checked:bg-primary",
        "checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22 fill=%22%23BDF83C%22><path d=%22M13.2 4.2 6.5 10.9 2.8 7.2l1.1-1.1 2.6 2.6 5.6-5.6z%22/></svg>')] checked:bg-center checked:bg-no-repeat",
        "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input, Select, Checkbox, controlClasses };
