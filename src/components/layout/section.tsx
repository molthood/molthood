import * as React from "react";

import { Container, type ContainerProps } from "@/components/layout/container";
import { cn } from "@/lib/utils";

const sectionSpacing = {
  none: "",
  sm: "py-10 sm:py-12",
  md: "py-12 sm:py-14 lg:py-16",
  lg: "py-14 sm:py-18 lg:py-20",
} as const;

export type SectionProps = React.ComponentProps<"section"> & {
  spacing?: keyof typeof sectionSpacing;
  containerSize?: ContainerProps["size"];
  /** Skip the inner Container when the section manages its own layout. */
  bare?: boolean;
  containerClassName?: string;
};

/** Vertical rhythm + container in one place, so pages never hardcode padding. */
function Section({
  className,
  children,
  spacing = "md",
  containerSize = "lg",
  bare = false,
  containerClassName,
  ...props
}: SectionProps) {
  return (
    <section
      data-slot="section"
      className={cn("relative w-full", sectionSpacing[spacing], className)}
      {...props}
    >
      {bare ? (
        children
      ) : (
        <Container size={containerSize} className={containerClassName}>
          {children}
        </Container>
      )}
    </section>
  );
}

export { Section, sectionSpacing };
