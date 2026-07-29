import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  cn(
    "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border",
    "px-2.5 py-0.5 text-[11px] font-bold tracking-wide whitespace-nowrap",
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3",
  ),
  {
    variants: {
      /*
       * On a lime field every tone has to stay dark to remain legible, so
       * status is carried by hue rather than by brightness.
       */
      variant: {
        default: "border-border-strong/60 bg-foreground/8 text-muted",
        primary: "border-primary/30 bg-primary/12 text-primary",
        outline: "border-border-strong bg-transparent text-muted",
        success: "border-[#12490F]/35 bg-[#12490F]/12 text-[#12490F]",
        info: "border-[#0B2A5C]/35 bg-[#0B2A5C]/12 text-[#0B2A5C]",
        warning: "border-[#4A3005]/35 bg-[#4A3005]/12 text-[#4A3005]",
        danger: "border-danger/35 bg-danger/12 text-danger",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
    /** Renders a leading dot in the badge's own colour. */
    dot?: boolean;
  };

function Badge({ className, variant, asChild = false, dot, children, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {dot ? (
        <span
          className="size-1.5 shrink-0 rounded-full bg-current"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </Comp>
  );
}

export { Badge, badgeVariants };
