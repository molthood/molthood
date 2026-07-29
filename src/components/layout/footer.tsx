import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/layout/container";
import { footerNav, siteConfig } from "@/config/site";

function Footer() {
  return (
    <footer className="mt-auto border-t border-border">
      <Container size="xl">
        <div className="flex flex-col gap-8 py-10 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex flex-col gap-3">
            <Link href="/" className="w-fit transition-opacity hover:opacity-80">
              <Logo />
            </Link>
            <p className="text-sm text-muted">
              Built exclusively for {siteConfig.chain}.
            </p>
          </div>

          <nav aria-label="Footer">
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {footerNav.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noreferrer noopener" : undefined}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-foreground"
                  >
                    {item.label}
                    {item.external ? (
                      <ArrowUpRight className="size-3.5 opacity-60" aria-hidden="true" />
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="flex flex-col gap-2 border-t border-border py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
          </p>
          <p className="font-mono text-[11px] font-bold tracking-wide text-muted">
            Phase 1 · Foundation
          </p>
        </div>
      </Container>
    </footer>
  );
}

export { Footer };
