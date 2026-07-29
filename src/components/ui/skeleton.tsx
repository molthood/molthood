import * as React from "react";

import { cn } from "@/lib/utils";

/** Shimmering placeholder block. Sized entirely by className. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-foreground/10", className)}
      {...props}
    />
  );
}

/** Skeleton shaped like a stat card — used by the dashboard's loading state. */
function SkeletonCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-card border border-border bg-surface p-5", className)}
      {...props}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="size-8 rounded-lg" />
      </div>
      <Skeleton className="mt-4 h-7 w-20" />
      <Skeleton className="mt-3 h-3 w-32" />
    </div>
  );
}

/** Skeleton shaped like a table row. */
function SkeletonRow({ columns = 6 }: { columns?: number }) {
  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-b-0">
      {Array.from({ length: columns }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn("h-3.5", index === 0 ? "w-24" : "flex-1")}
        />
      ))}
    </div>
  );
}

export { Skeleton, SkeletonCard, SkeletonRow };
