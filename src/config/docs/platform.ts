import type { DocCategory } from "@/config/docs/types";

/** Security, privacy, limits, and the vocabulary the rest of the docs use. */
export const platform: DocCategory = {
  id: "platform",
  title: "Platform",
  description: "Security, privacy, limits, and the words used throughout these docs.",
  pages: [
    {
      slug: "security",
      title: "Security",
      description:
        "How credentials are handled, what runs where, and what Molthood deliberately cannot do.",
      blocks: [
        {
          kind: "text",
          content:
            "Molthood is a **read-only** analysis platform. It reads public chain state and public web pages. It has no custody, signs nothing, and submits no transactions.",
        },
        { kind: "heading", id: "no-wallet", content: "It never touches your wallet" },
        {
          kind: "text",
          content:
            "There is no wallet connection anywhere in the product. Analysing an address requires only the address, which is public information. Nothing asks you to sign a message, approve a transaction, or connect anything.",
        },
        {
          kind: "callout",
          tone: "danger",
          title: "Nobody from Molthood will ever ask for a seed phrase or private key",
          content:
            "There is no feature that could use one. Any request claiming otherwise is not us, regardless of what it looks like.",
        },
        { kind: "heading", id: "credentials", content: "Credentials" },
        {
          kind: "definitions",
          items: [
            {
              term: "Stored as hashes",
              description:
                "An API key is shown once at creation and stored hashed. It cannot be recovered — a lost key is replaced, not retrieved.",
            },
            {
              term: "Never sent to the browser",
              description:
                "Provider credentials live server-side only. No key that costs money is ever included in code served to a visitor.",
            },
            {
              term: "Revocable independently",
              description: "Revoking one key leaves every other key working.",
            },
          ],
        },
        { kind: "heading", id: "isolation", content: "Isolation" },
        {
          kind: "text",
          content:
            "Analysis that requires executing code runs in an isolated sandbox with no access to platform credentials or other users' data. Outbound requests are validated before they are made, so a supplied URL cannot be used to reach a private network address.",
        },
        { kind: "heading", id: "reporting", content: "Reporting an issue" },
        {
          kind: "text",
          content:
            "If you find a security problem, please report it privately rather than opening a public issue, and give us a chance to fix it before disclosure.",
        },
      ],
    },
    {
      slug: "privacy",
      title: "Privacy",
      description:
        "What is stored, what is scoped to your key, and what never leaves your browser.",
      blocks: [
        {
          kind: "text",
          content:
            "Analysis is private by default. An address you ask about is not published, listed, or shown to anyone else.",
        },
        { kind: "heading", id: "scoping", content: "Everything is scoped to a key" },
        {
          kind: "text",
          content:
            "Every execution records the key that ran it. History, permalinks, cached results and change detection are all scoped to that key. A wallet analysis records the address someone asked about, and putting that on a shared list is not an acceptable default.",
        },
        {
          kind: "text",
          content:
            "A run becomes visible to others only if its owner explicitly publishes it. The public feed contains published runs and nothing else — it is empty rather than seeded, because seeding it would mean publishing somebody's analysis for them.",
        },
        { kind: "heading", id: "agent", content: "Molthood Agent conversations" },
        {
          kind: "text",
          content:
            "Conversations are stored **in your browser**, not on a server. There is no account system yet, and keeping them server-side without one would mean either a shared list anyone could read or an identity nobody asked to create.",
        },
        {
          kind: "text",
          content:
            "Your messages are sent to the model provider in order to be answered — that is what answering requires — but they are not retained by Molthood after the response completes.",
        },
        { kind: "heading", id: "analytics", content: "Analytics" },
        {
          kind: "text",
          content:
            "Product analytics record which surfaces are used and whether requests succeed. The event schema deliberately cannot carry content: no addresses, no questions, no report bodies. What is measured is shape, not substance.",
        },
      ],
    },
    {
      slug: "rate-limits",
      title: "Rate limits",
      description:
        "Two separate limits — one protects the server, the other protects your budget.",
      blocks: [
        {
          kind: "text",
          content:
            "There are two limits, and they exist for different reasons. Confusing them makes both look arbitrary.",
        },
        {
          kind: "definitions",
          items: [
            {
              term: "Pace — requests per window",
              description:
                "Protects the server from a burst. In-process and short-lived; a moment's pause clears it.",
            },
            {
              term: "Spend — analyses per day, per key",
              description:
                "Protects money. An analysis costs real inference credit, so the allowance is held in the database and survives restarts.",
            },
          ],
        },
        { kind: "heading", id: "what-counts", content: "What counts against the allowance" },
        {
          kind: "text",
          content:
            "Running an analysis does. Reading a report you have already run does not. A monitored subject spends the owner's allowance exactly as a manual run would — a scheduled check is not free just because nobody clicked it.",
        },
        {
          kind: "text",
          content:
            "A request rejected before any work started is not charged. A run that failed partway through **is** charged, because it already called live sources and spent time upstream.",
        },
        { kind: "heading", id: "exhausted", content: "When the allowance is gone" },
        {
          kind: "text",
          content:
            "The request is refused with a clear reason rather than answered with a degraded result. In Molthood Agent this appears as a check that could not run — never as an analysis that found nothing.",
        },
      ],
    },
    {
      slug: "glossary",
      title: "Glossary",
      description: "The terms used throughout these docs, defined once.",
      blocks: [
        {
          kind: "definitions",
          items: [
            { term: "Agent", description: "A specialist that gathers one kind of evidence — market data, contract powers, public presence." },
            { term: "Analysis", description: "One run against one subject, producing a report." },
            { term: "Artifact", description: "A downloadable output of a run: a report file, a dataset, a chart." },
            { term: "Capability", description: "Something the platform can do, which one or more sources may be able to serve." },
            { term: "Ceiling score", description: "A risk score reported as an upper bound because a check could not run. The real score cannot be higher; it may be lower." },
            { term: "Confirmed", description: "The check ran and this is the answer." },
            { term: "Evidence", description: "One observed fact, with its source and its state. Never AI-generated." },
            { term: "Execution", description: "A single run of the pipeline, identified so it can be retrieved later." },
            { term: "Finding", description: "An interpreted piece of evidence — what it means, rather than what it is." },
            { term: "Refuted", description: "A claim the subject makes about itself does not hold." },
            { term: "Signal", description: "A named risk rule and its outcome, with the severity it carries." },
            { term: "Subject", description: "The thing being analysed: a token, wallet, contract, website, or the chain itself." },
            { term: "Summary", description: "AI-written prose over findings that already exist. Kept strictly separate from evidence." },
            { term: "Unknown", description: "The check could not run. Not a negative result, and never displayed as one." },
            { term: "Watch", description: "A subject scheduled for re-analysis, producing a change report rather than a repeat." },
          ],
        },
      ],
    },
  ],
};
