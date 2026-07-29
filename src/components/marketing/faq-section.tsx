"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Heading } from "@/components/layout/heading";
import { Section } from "@/components/layout/section";
import { Reveal } from "@/components/motion/reveal";
import { faq } from "@/config/landing";
import { cn } from "@/lib/utils";

/**
 * Answers to what a careful reader actually asks.
 *
 * Built on native `<details>` so it works with the keyboard, with a screen
 * reader, and before JavaScript arrives — an accordion that needs a hydrated
 * bundle to open is a worse accordion.
 */
function FaqSection() {
  return (
    <Section spacing="md" containerSize="xl" className="border-t border-border">
      <Container size="xl">
        <div className="grid gap-10 lg:grid-cols-[20rem_1fr]">
          <Reveal preset="fadeUp">
            <div className="flex flex-col gap-3">
              <span className="font-mono text-[11px] font-bold tracking-[0.14em] text-muted uppercase">
                Questions
              </span>
              <Heading as="h2" size="lg" weight="semibold">
                What to expect
              </Heading>
            </div>
          </Reveal>

          <Reveal preset="fadeUp" delay={0.08}>
            <ul className="flex flex-col divide-y divide-border border-y border-border">
              {faq.map((item) => (
                <FaqRow key={item.question} {...item} />
              ))}
            </ul>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

function FaqRow({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <li>
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="group"
      >
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-4 [&::-webkit-details-marker]:hidden">
          <span className="text-[15px] font-semibold text-foreground">
            {question}
          </span>
          <span
            className={cn(
              "mt-0.5 shrink-0 text-muted transition-colors",
              "group-hover:text-foreground",
            )}
            aria-hidden="true"
          >
            {open ? <Minus className="size-4" /> : <Plus className="size-4" />}
          </span>
        </summary>
        <p className="max-w-2xl pb-5 text-sm leading-relaxed font-medium text-muted">
          {answer}
        </p>
      </details>
    </li>
  );
}

export { FaqSection };
