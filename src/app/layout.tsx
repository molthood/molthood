import type { Metadata, Viewport } from "next";

import { X_HANDLE, siteConfig } from "@/config/site";
import { fontVariables } from "@/lib/fonts";
import { cn } from "@/lib/utils";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s — ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: [
    "Molthood",
    "Robinhood Chain",
    "AI agents",
    "execution platform",
    "onchain automation",
  ],
  openGraph: {
    images: [{ url: "/og.png", width: 1200, height: 630, alt: siteConfig.name }],
    type: "website",
    url: siteConfig.url,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    siteName: siteConfig.name,
  },
  twitter: {
    images: [{ url: "/og.png", width: 1200, height: 630, alt: siteConfig.name }],
    site: X_HANDLE,
    creator: X_HANDLE,
    card: "summary_large_image",
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  // Ownership proof for Virtuals Protocol. It lives in the root layout rather
  // than the site segment because a page that declares its own `openGraph` or
  // `other` replaces the inherited object wholesale — the same trap that
  // silently dropped the social cards once. Here it is inherited by every
  // surface and cannot be knocked out by a child.
  other: {
    "virtual-protocol-site-verification": "0d277939f8d8215215fca1aeee067483",
  },
};

export const viewport: Viewport = {
  themeColor: "#BDF83C",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn(fontVariables, "h-full")}>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
