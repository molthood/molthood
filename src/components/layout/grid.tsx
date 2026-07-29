import * as React from "react";

import { cn } from "@/lib/utils";

const gridCols = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
} as const;

const gridGaps = {
  sm: "gap-3",
  md: "gap-4",
  lg: "gap-6",
} as const;

export type GridProps = React.ComponentProps<"div"> & {
  cols?: keyof typeof gridCols;
  gap?: keyof typeof gridGaps;
};

/** Responsive grid with a fixed set of column ramps — keeps breakpoints consistent. */
function Grid({ className, cols = 3, gap = "md", ...props }: GridProps) {
  return (
    <div
      data-slot="grid"
      className={cn("grid", gridCols[cols], gridGaps[gap], className)}
      {...props}
    />
  );
}

export { Grid };
