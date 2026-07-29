"use client";

import * as React from "react";

/** Subscribes to a CSS media query. Returns `false` during SSR. */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);

    setMatches(mql.matches);
    mql.addEventListener("change", onChange);

    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Matches the Tailwind `lg` breakpoint. */
export function useIsDesktop() {
  return useMediaQuery("(min-width: 1024px)");
}
