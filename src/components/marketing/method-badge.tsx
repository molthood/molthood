import * as React from "react";

import type { HttpMethod } from "@/config/api";
import { cn } from "@/lib/utils";

/**
 * On a green field every verb reads as ink — differentiation comes from a
 * dark hue shift rather than from brightness, which the background already owns.
 */
const methodStyles: Record<HttpMethod, string> = {
  GET: "border-foreground/30 bg-foreground/10 text-foreground",
  POST: "border-[#0b2a5c]/35 bg-[#0b2a5c]/12 text-[#0b2a5c]",
  PATCH: "border-[#4a3005]/35 bg-[#4a3005]/12 text-[#4a3005]",
  DELETE: "border-danger/35 bg-danger/12 text-danger",
};

/** Fixed-width HTTP verb chip so endpoint paths stay optically aligned. */
function MethodBadge({ method, className }: { method: HttpMethod; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-16 shrink-0 items-center justify-center rounded-md border px-2 py-1",
        "font-mono text-[10px] font-bold tracking-wider",
        methodStyles[method],
        className,
      )}
    >
      {method}
    </span>
  );
}

export { MethodBadge };
