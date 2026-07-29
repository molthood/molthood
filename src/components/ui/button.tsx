import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  cn(
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg",
    "font-semibold transition-[color,background-color,border-color,opacity] duration-150 ease-out",
    "outline-none disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ),
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-background hover:bg-primary-hover active:bg-primary-hover",
        secondary:
          "border border-border bg-surface text-foreground hover:border-border-strong hover:bg-surface-raised",
        outline:
          "border border-border bg-transparent text-foreground hover:border-border-strong hover:bg-surface",
        ghost: "bg-transparent text-muted hover:bg-surface hover:text-foreground",
        link: "h-auto p-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-5 text-[15px]",
        icon: "size-9 p-0",
      },
    },
    compoundVariants: [{ variant: "link", size: ["sm", "md", "lg"], class: "h-auto px-0" }],
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render as the child element (e.g. a `next/link`) instead of a `<button>`. */
    asChild?: boolean;
  };

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
