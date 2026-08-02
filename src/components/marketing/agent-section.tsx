"use client";

import * as React from "react";
import { ArrowUpRight, Check, Sparkles } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";
import { Container } from "@/components/layout/container";
import { Section } from "@/components/layout/section";
import { CURATED_MODELS } from "@/config/agent-models";
import { SITE_URL } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * Molthood Agent, on the landing page.
 *
 * Shown rather than described. A paragraph claiming an assistant is good is
 * worth very little; a transcript of it declining to guess is worth a lot,
 * because that is the behaviour people cannot check from a feature list.
 *
 * The exchange below is **illustrative and labelled as such**. It is shaped
 * like a real answer — the timeline, the sources, the refusal to fill a gap —
 * but it is not a live run, and a mockup that pretended otherwise would be the
 * exact dishonesty the product exists to avoid.
 */

const TIMELINE = [
  "Recognised an address",
  "Read market, liquidity and holders",
  "Ran security checks",
];

const REPLY = [
  { kind: "verdict" as const, text: "Elevated risk — 35/100, where higher is safer." },
  {
    kind: "line" as const,
    text: "Transfers can be paused and the owner is not identifiable from the contract. Your ability to sell is conditional on somebody else's decision.",
  },
  {
    kind: "line" as const,
    text: "Liquidity is $136K against $3.97M of 24h volume — roughly 29× turnover on a thin pool.",
  },
  {
    kind: "muted" as const,
    text: "Holder concentration could not be read. That is unknown, not clean.",
  },
];

function ChatPreview() {
  return (
    <div className="border-border-strong bg-[#08090a] rounded-card overflow-hidden border shadow-2xl">
      <div className="border-border flex items-center gap-2 border-b px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="bg-border-strong size-2 rounded-full" />
          <span className="bg-border-strong size-2 rounded-full" />
          <span className="bg-border-strong size-2 rounded-full" />
        </span>
        <span className="text-muted ml-1 font-mono text-[10px] font-bold tracking-wide">
          Molthood Agent
        </span>
        <span className="border-border-strong text-muted ml-auto rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-bold">
          Illustrative
        </span>
      </div>

      <div className="flex flex-col gap-3.5 p-4 sm:p-5">
        <div className="flex justify-end">
          <p className="border-border bg-[#111314] max-w-[85%] rounded-2xl rounded-br-md border px-3.5 py-2.5 text-[13px] leading-relaxed font-medium text-[#eef2e6]">
            Is this token risky? 0x8e62…3F1c
          </p>
        </div>

        <ul className="border-border rounded-xl border bg-black/40 px-3 py-2.5">
          {TIMELINE.map((step) => (
            <li
              key={step}
              className="flex items-center gap-2 py-0.5 text-[11px] font-medium text-[#eef2e6]"
            >
              <Check className="text-primary size-3 shrink-0" aria-hidden="true" />
              {step}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2">
          {REPLY.map((line) => (
            <p
              key={line.text}
              className={cn(
                "text-[13px] leading-relaxed",
                line.kind === "verdict"
                  ? "font-bold text-[#eef2e6]"
                  : line.kind === "muted"
                    ? "font-medium text-[#98a187]"
                    : "font-medium text-[#c9d1bd]",
              )}
            >
              {line.text}
            </p>
          ))}
        </div>

        <div className="border-border flex flex-wrap gap-1.5 border-t pt-3">
          {["Chain explorer", "Market data", "Security screening"].map((source) => (
            <span
              key={source}
              className="border-border rounded-md border px-2 py-1 text-[10px] font-medium text-[#98a187]"
            >
              {source}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentSection() {
  return (
    <Section spacing="lg" divided bare>
      <Container size="lg">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <Reveal>
            <div>
              <p className="text-primary font-mono text-[11px] font-bold tracking-[0.14em] uppercase">
                Molthood Agent
              </p>
              <h2 className="font-display text-foreground mt-3 text-[30px] leading-[1.1] font-bold tracking-[-0.024em] sm:text-[38px]">
                One Agent. Every model. Live crypto intelligence.
              </h2>
              <p className="text-muted mt-4 text-[16px] leading-relaxed font-medium">
                Ask about a wallet, a token, a contract or a whole project in a
                sentence. The Agent decides what needs checking, checks it
                against live Robinhood Chain data, and tells you plainly what it
                could not establish.
              </p>

              <ul className="mt-6 flex flex-col gap-2.5">
                {[
                  "Chooses its own tools — you never pick one",
                  "Every claim carries the source it came from",
                  "Generates reports, spreadsheets and decks as real files",
                  "Answers about Molthood from Molthood's own documentation",
                ].map((point) => (
                  <li key={point} className="flex items-start gap-2.5">
                    <Sparkles
                      className="text-primary mt-0.5 size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="text-foreground text-sm leading-relaxed font-medium">
                      {point}
                    </span>
                  </li>
                ))}
              </ul>

              <a
                href={`${SITE_URL}/askmoltagent`}
                className="bg-primary text-background hover:bg-primary-hover mt-8 inline-flex h-11 items-center gap-2 rounded-lg px-5 text-[15px] font-bold transition-colors"
              >
                Ask Molthood Agent
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <ChatPreview />
          </Reveal>
        </div>

        {/* Why several models, answered concretely rather than as a boast. */}
        <Reveal delay={0.12}>
          <div className="border-border mt-14 rounded-card border p-6 sm:p-8">
            <h3 className="font-display text-foreground text-lg font-bold">
              Why more than one model
            </h3>
            <p className="text-muted mt-2 max-w-[52rem] text-sm leading-relaxed font-medium">
              Models are not interchangeable. One reasons for a long time and is
              worth the wait on a contract; another answers instantly and is
              better for writing. Molthood keeps the tools, the evidence and the
              conversation identical across all of them, so switching costs you
              nothing — the subject and the history carry over mid-conversation.
            </p>

            <ul className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {CURATED_MODELS.map((model) => (
                <li
                  key={model.id}
                  className="border-border rounded-xl border px-3.5 py-3"
                >
                  <span className="text-foreground block text-[13px] font-bold">
                    {model.label}
                  </span>
                  <span className="text-muted mt-0.5 block text-[11px] leading-snug font-medium">
                    {model.bestFor}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}

export { AgentSection };
