"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Menu, X } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/layout/container";
import { SectionDivider } from "@/components/layout/divider";
import { Button } from "@/components/ui/button";
import { SITE_URL, mainNav, siteConfig, type NavItem } from "@/config/site";
import { useScrolled } from "@/hooks/use-scrolled";
import { cn } from "@/lib/utils";

function isActive(pathname: string, item: NavItem) {
  const target = item.activePath ?? item.href;
  if (target === "/") return pathname === "/";
  return pathname === target || pathname.startsWith(`${target}/`);
}

function Navbar() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const scrolled = useScrolled(8);
  const [open, setOpen] = React.useState(false);

  // Close the mobile sheet whenever the route changes.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Prevent background scroll while the mobile sheet is open.
  React.useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        // Black at every scroll position, not only once scrolled. A bar that
        // changed colour on scroll would flash from black to black — the
        // transition existed to introduce a background that is now always
        // there.
        //
        // `molthood-dark` rather than a hand-picked set of inverted classes.
        // The bar was written twice — once here in literal colours, once in
        // the console topbar — and the two drifted. Now both take the palette
        // and `text-muted` means the same thing on either.
        "molthood-dark sticky top-0 z-50 w-full bg-background",
        "transition-shadow duration-200 ease-out",
        scrolled || open ? "shadow-[0_1px_0_0_var(--color-border)]" : "",
      )}
    >
      <Container size="xl">
        <nav className="flex h-16 items-center justify-between gap-6" aria-label="Main">
          {/* Absolute. This navbar renders on the docs host too, where "/" is
              the documentation root rather than the site — so a relative mark
              took a visitor deeper instead of back out. */}
          <a
            href={SITE_URL}
            className="rounded-md transition-opacity hover:opacity-80"
            aria-label={`${siteConfig.name} home`}
          >
            <Logo />
          </a>

          <ul className="hidden items-center gap-1 md:flex">
            {mainNav.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noreferrer noopener" : undefined}
                  aria-current={
                    isActive(pathname, item) && !item.external
                      ? "page"
                      : undefined
                  }
                  className={cn(
                    "relative inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors duration-150",
                    isActive(pathname, item) && !item.external
                      ? "text-primary"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  {item.label}
                  {item.external ? (
                    <ArrowUpRight className="size-3.5 opacity-60" aria-hidden="true" />
                  ) : null}

                  {/* A shared `layoutId` makes the marker travel between items
                      rather than cross-fading — the detail that separates a
                      considered navigation from a coloured link. */}
                  {isActive(pathname, item) && !item.external ? (
                    <motion.span
                      layoutId="nav-active"
                      className="bg-primary absolute inset-x-3 -bottom-px h-px"
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 380, damping: 32 }
                      }
                      aria-hidden="true"
                    />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <Button
              asChild
              size="sm"
              className="hidden sm:inline-flex"
            >
              <Link href={siteConfig.links.console}>Open Console</Link>
            </Button>

            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? "Close menu" : "Open menu"}
              className="text-muted hover:text-foreground hover:bg-surface-raised inline-flex size-9 items-center justify-center rounded-md transition-colors md:hidden"
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </nav>
      </Container>

      {/* The header's bottom edge, inside the black band. Placed here rather
          than on the page below it: as a sibling it left a strip of field
          between the bar and the hairline, which is the leftover green. */}
      <SectionDivider onDark className="pb-1" />

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id="mobile-nav"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="border-border bg-background overflow-hidden border-t md:hidden"
          >
            <Container size="xl" className="py-4">
              <ul className="flex flex-col gap-1">
                {mainNav.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      target={item.external ? "_blank" : undefined}
                      rel={item.external ? "noreferrer noopener" : undefined}
                      className={cn(
                        "flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-semibold transition-colors",
                        isActive(pathname, item) && !item.external
                          ? "text-primary bg-surface-raised"
                          : "text-muted hover:text-foreground hover:bg-surface",
                      )}
                    >
                      {item.label}
                      {item.external ? (
                        <ArrowUpRight className="size-4 opacity-60" aria-hidden="true" />
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
              <Button
                asChild
                className="mt-4 w-full sm:hidden"
              >
                <Link href={siteConfig.links.console}>Open Console</Link>
              </Button>
            </Container>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

export { Navbar };
