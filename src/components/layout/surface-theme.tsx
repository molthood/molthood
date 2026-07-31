"use client";

import * as React from "react";

/**
 * Which palette the surrounding surface is using.
 *
 * Exists for one reason: overlays are portalled to `document.body`, so a
 * dropdown opened inside the console is *outside* the console in the DOM and
 * the `.molthood-dark` token scope never reaches it. A menu that stayed neon
 * green while the page behind it was black was the visible symptom.
 *
 * Context crosses portals because it follows the React tree rather than the
 * DOM tree, which is exactly the property needed here.
 */
const SurfaceThemeContext = React.createContext<"light" | "dark">("light");

function SurfaceTheme({
  theme,
  children,
}: {
  theme: "light" | "dark";
  children: React.ReactNode;
}) {
  return (
    <SurfaceThemeContext.Provider value={theme}>
      {children}
    </SurfaceThemeContext.Provider>
  );
}

/** The palette class for a portalled element, or `undefined` on the field. */
function useSurfaceThemeClass() {
  return React.useContext(SurfaceThemeContext) === "dark"
    ? "molthood-dark"
    : undefined;
}

export { SurfaceTheme, useSurfaceThemeClass };
