import Link from "next/link";

import { Footer } from "@/components/layout/footer";
import { Container } from "@/components/layout/container";
import { Heading } from "@/components/layout/heading";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <main className="flex flex-1 items-center">
        <Container size="lg" className="py-24 text-center">
          <p className="font-mono text-[11px] tracking-[0.16em] text-primary uppercase">
            404
          </p>
          <Heading as="h1" size="xl" weight="semibold" className="mt-4">
            This page does not exist.
          </Heading>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted">
            The route you followed is not part of {siteConfig.name}. Everything the
            platform exposes is reachable from the console or the documentation.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/">Back to home</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href={siteConfig.links.docs}>Documentation</Link>
            </Button>
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
