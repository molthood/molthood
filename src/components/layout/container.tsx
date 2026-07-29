import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

const containerSizes = {
  sm: "max-w-3xl",
  md: "max-w-5xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
  full: "max-w-none",
} as const;

export type ContainerProps = React.ComponentProps<"div"> & {
  size?: keyof typeof containerSizes;
  asChild?: boolean;
};

/** Horizontal gutter + max-width. The single source of truth for page width. */
function Container({ className, size = "lg", asChild = false, ...props }: ContainerProps) {
  const Comp = asChild ? Slot : "div";

  return (
    <Comp
      data-slot="container"
      className={cn("mx-auto w-full px-5 sm:px-6 lg:px-8", containerSizes[size], className)}
      {...props}
    />
  );
}

export { Container, containerSizes };
