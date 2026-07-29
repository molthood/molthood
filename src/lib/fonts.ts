import { GeistSans } from "geist/font/sans";
import { Inter, JetBrains_Mono } from "next/font/google";

/** Headings — Geist, self-hosted via the `geist` package. */
export const fontDisplay = GeistSans;

/** Body copy — Inter. */
export const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/** Code, addresses, hashes — JetBrains Mono. */
export const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const fontVariables = [
  fontDisplay.variable,
  fontSans.variable,
  fontMono.variable,
].join(" ");
