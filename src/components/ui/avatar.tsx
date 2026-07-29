import * as React from "react";

import { cn } from "@/lib/utils";

const avatarSizes = {
  sm: "size-7 text-[10px]",
  md: "size-8 text-[11px]",
  lg: "size-11 text-sm",
} as const;

export type AvatarProps = React.ComponentProps<"span"> & {
  initials: string;
  size?: keyof typeof avatarSizes;
};

/**
 * Initials-only avatar. There is no image upload in this phase, so this
 * deliberately has no `src` — it renders from initials alone.
 */
function Avatar({ initials, size = "md", className, ...props }: AvatarProps) {
  return (
    <span
      data-slot="avatar"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        "border border-border-strong bg-primary font-mono font-bold text-background",
        avatarSizes[size],
        className,
      )}
      {...props}
    >
      {initials}
    </span>
  );
}

export { Avatar };
