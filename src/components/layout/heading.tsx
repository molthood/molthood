import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const headingVariants = cva("font-display text-foreground", {
  variants: {
    size: {
      display: "text-[2.75rem] leading-[1.06] sm:text-6xl lg:text-[4.25rem]",
      xl: "text-3xl leading-[1.12] sm:text-4xl lg:text-[2.75rem]",
      lg: "text-2xl leading-[1.18] sm:text-3xl",
      md: "text-xl leading-snug sm:text-2xl",
      sm: "text-base leading-snug sm:text-lg",
    },
    weight: {
      medium: "font-semibold",
      semibold: "font-bold",
    },
  },
  defaultVariants: {
    size: "lg",
    weight: "medium",
  },
});

type HeadingLevel = "h1" | "h2" | "h3" | "h4";

export type HeadingProps = React.ComponentProps<"h2"> &
  VariantProps<typeof headingVariants> & {
    as?: HeadingLevel;
  };

function Heading({ className, size, weight, as = "h2", ...props }: HeadingProps) {
  const Comp = as;

  return (
    <Comp
      data-slot="heading"
      className={cn(headingVariants({ size, weight }), className)}
      {...props}
    />
  );
}

export type EyebrowProps = React.ComponentProps<"p">;

/** Small uppercase label that sits above a section heading. */
function Eyebrow({ className, ...props }: EyebrowProps) {
  return (
    <p
      data-slot="eyebrow"
      className={cn(
        "font-mono text-[11px] font-bold tracking-[0.16em] text-primary uppercase",
        className,
      )}
      {...props}
    />
  );
}

export type LeadProps = React.ComponentProps<"p">;

/** Supporting paragraph under a heading. */
function Lead({ className, ...props }: LeadProps) {
  return (
    <p
      data-slot="lead"
      className={cn(
        "text-base leading-relaxed font-medium text-muted sm:text-lg",
        className,
      )}
      {...props}
    />
  );
}

export type SectionHeadingProps = {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  size?: HeadingProps["size"];
  as?: HeadingLevel;
  className?: string;
};

/** Eyebrow + heading + lead, spaced consistently across every section. */
function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  size = "xl",
  as = "h2",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Heading as={as} size={size}>
        {title}
      </Heading>
      {description ? (
        <Lead className={cn("max-w-2xl", align === "center" && "mx-auto")}>
          {description}
        </Lead>
      ) : null}
    </div>
  );
}

export { Heading, Eyebrow, Lead, SectionHeading, headingVariants };
