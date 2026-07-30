import * as React from "react";

import { Container, type ContainerProps } from "@/components/layout/container";
import { SectionDivider } from "@/components/layout/divider";
import { cn } from "@/lib/utils";

const sectionSpacing = {
  none: "",
  sm: "py-10 sm:py-12",
  md: "py-12 sm:py-14 lg:py-16",
  lg: "py-14 sm:py-18 lg:py-20",
} as const;

export type SectionProps = React.ComponentProps<"section"> & {
  spacing?: keyof typeof sectionSpacing;
  /**
   * Separate this section from the one above with the brand divider.
   *
   * Replaces `border-t border-border`, which was a uniform edge-to-edge rule
   * repeated down the page — the same default-`<hr>` reading, five times over,
   * where one instance would already have been noticeable.
   */
  divided?: boolean;
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
  divided = false,
  containerClassName,
  ...props
}: SectionProps) {
  return (
    <section
      data-slot="section"
      className={cn("relative w-full", sectionSpacing[spacing], className)}
      {...props}
    >
      {divided ? <SectionDivider className="absolute inset-x-0 top-0" /> : null}
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
