import type { DocPage } from "@/config/docs/types";

/** Worked examples and habits, appended to Getting started. */
export const practicePages: DocPage[] = [
  {
    slug: "examples",
    title: "Examples",
    description: "Concrete things to try, and what a good answer looks like.",
    blocks: [
      {
        kind: "text",
        content:
          "Each example below is a real thing to do, with a note on what to look for in the result. The fastest way through them is [Molthood Agent](/molthood-agent), which needs nothing installed.",
      },

      { kind: "heading", id: "screen-a-token", content: "Screen a token before buying" },
      {
        kind: "code",
        label: "Ask",
        content:
          "Is this token risky? Tell me what you checked and what you could not:\n0x8e62F281f282686fCa6dCB39288069a93fC23F1c",
      },
      {
        kind: "text",
        content:
          "**What to look for:** the contract powers, not the score. A pausable token with an unidentifiable owner is a position whose exit depends on somebody else's choice, regardless of how the number reads.",
      },

      { kind: "heading", id: "check-a-wallet", content: "Check a wallet" },
      {
        kind: "code",
        label: "Ask",
        content: "Analyse this wallet and tell me what it holds and what you could not check: 0x…",
      },
      {
        kind: "text",
        content:
          "**What to look for:** concentration, and whether every holding was screened. If one was not, the score you are given is a ceiling.",
      },

      { kind: "heading", id: "research", content: "Research a project" },
      {
        kind: "code",
        label: "Ask",
        content: "Research this project and tell me what is verifiable about it: example.com",
      },
      {
        kind: "text",
        content:
          "**What to look for:** what is missing. A domain registered days ago, no published terms, an audits page with no audit on it — absence is the finding here.",
      },

      { kind: "heading", id: "compare", content: "Compare two subjects" },
      {
        kind: "code",
        label: "Ask",
        content: "Compare these two tokens and name the differences that matter: 0x… and 0x…",
      },
      {
        kind: "text",
        content:
          "**What to look for:** differences in control, not in price. Two tokens at the same market cap can be entirely different instruments.",
      },

      { kind: "heading", id: "watch", content: "Watch for change" },
      {
        kind: "text",
        content:
          "Run an analysis, then run it again later. The second run reports what moved rather than repeating itself — liquidity leaving and ownership transferring are the two changes worth catching early.",
      },

      { kind: "heading", id: "explain-code", content: "Understand a contract" },
      {
        kind: "code",
        label: "Ask",
        content: "Explain what this smart contract does, in plain language, and what powers it gives its owner: 0x…",
      },
      {
        kind: "text",
        content:
          "**What to look for:** the owner's powers stated explicitly. \"The owner can pause transfers\" is worth more than three paragraphs about the token standard.",
      },
    ],
  },
  {
    slug: "best-practices",
    title: "Best practices",
    description: "Habits that make the difference between reading a report and using one.",
    blocks: [
      {
        kind: "text",
        content:
          "Molthood is built to make one distinction impossible to miss. These habits are about not losing it again on your side.",
      },

      { kind: "heading", id: "read-unknowns", content: "Read the unknowns first" },
      {
        kind: "text",
        content:
          "Findings tell you what was established. The unknowns tell you how much of the picture you actually have. A report with two findings and nine unknowns is not a reassuring report, however good the two look.",
      },

      { kind: "heading", id: "address-not-ticker", content: "Use addresses, not tickers" },
      {
        kind: "text",
        content:
          "Tickers are not unique, and a token impersonating a well-known one will happily share its symbol. An address is unambiguous. Copy it from the source you are actually about to trade against, not from a message.",
      },

      { kind: "heading", id: "ceiling", content: "Treat a ceiling as a ceiling" },
      {
        kind: "text",
        content:
          "When a score is reported as an upper bound, the real risk cannot be lower than shown — it may be considerably higher. Re-run it when the missing check becomes available rather than acting on the bound.",
      },

      { kind: "heading", id: "verify", content: "Follow the source link" },
      {
        kind: "text",
        content:
          "Every finding carries the link it came from. For anything you are about to act on, open it. The links exist precisely so you do not have to trust the summary.",
      },

      { kind: "heading", id: "recheck", content: "Re-check before acting, not once" },
      {
        kind: "text",
        content:
          "An analysis is a photograph. Liquidity can be pulled and ownership transferred between your check and your transaction. For anything of size, re-run immediately beforehand.",
      },

      { kind: "heading", id: "separate", content: "Keep evidence and prose separate" },
      {
        kind: "text",
        content:
          "The summary is written over the findings, and it can be wrong about them in the way any writing can. The evidence list is the record. When they disagree, the evidence is right.",
      },

      { kind: "heading", id: "not-advice", content: "It is not advice" },
      {
        kind: "callout",
        tone: "warning",
        content:
          "Molthood reports what it found and what it could not check. It does not tell you what to buy, and a clean report is not an endorsement — it is the absence of the specific problems it knows how to look for.",
      },
    ],
  },
];
