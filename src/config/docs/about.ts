import type { DocCategory } from "@/config/docs/types";

/** What Molthood is, why it exists, and how it is put together. */
export const about: DocCategory = {
  id: "overview",
  title: "Overview",
  description: "What Molthood is, why it works the way it does, and what it runs on.",
  pages: [
    {
      slug: "about",
      title: "About Molthood",
      description:
        "An AI execution platform for Robinhood Chain: you describe a subject, agents gather evidence, and every finding carries its source.",
      blocks: [
        {
          kind: "text",
          content:
            "Molthood is an **AI execution platform built for Robinhood Chain**. You describe a subject — a token, a wallet, a contract, a website — and a set of agents gathers evidence about it from independent sources, then reports what they found.",
        },
        {
          kind: "text",
          content:
            "It is not a chat interface with a chain plugin. The analysis runs first and the language comes second: findings are produced by code against live data, and the prose is written over the top of them. That order is the whole design.",
        },
        {
          kind: "heading", id: "what-you-get", content: "What you get" },
        {
          kind: "definitions",
          items: [
            {
              term: "A report, not an opinion",
              description:
                "Every finding names the source it came from and can be checked without trusting us.",
            },
            {
              term: "An explicit unknown",
              description:
                "A check that could not run is reported as unknown. It is never quietly dropped, which would leave it looking like a check that passed.",
            },
            {
              term: "A score you can read backwards",
              description:
                "Risk scores come with the signals that produced them, so you can disagree with the weighting and still use the evidence.",
            },
            {
              term: "Change over time",
              description:
                "Re-running a subject produces a diff rather than a second full report, because what moved is the part worth reading.",
            },
          ],
        },
        { kind: "heading", id: "surfaces", content: "Where to use it" },
        {
          kind: "definitions",
          items: [
            {
              term: "Console",
              description:
                "Run an analysis, watch it stream, read the report, compare subjects, keep a history.",
            },
            {
              term: "Molthood Agent",
              description:
                "Ask in a sentence. It decides whether live data is needed and fetches it. See [Molthood Agent](/molthood-agent).",
            },
            {
              term: "API",
              description:
                "The same engine over HTTP for your own code. See the [API reference](/api).",
            },
          ],
        },
      ],
    },
    {
      slug: "why",
      title: "Why Molthood exists",
      description:
        "Most on-chain tooling answers confidently whether or not it checked anything. That gap is the product.",
      blocks: [
        {
          kind: "text",
          content:
            "There is no shortage of tools that will tell you a token is safe. The problem is that almost none of them distinguish between **checked and clean** and **not checked at all**, and those two produce identical-looking green ticks.",
        },
        {
          kind: "text",
          content:
            "That is not a small omission. It inverts the meaning of the result. A scanner that could not reach the contract source, could not read the liquidity, and could not resolve ownership will happily show you a page with no warnings on it — and no warnings reads as good news.",
        },
        {
          kind: "heading", id: "the-rule", content: "The rule" },
        {
          kind: "callout",
          tone: "warning",
          title: "A check that could not run must never render as a check that came back clean",
          content:
            "Every finding in Molthood is confirmed, refuted, or unknown. There is no fourth state, and unknown is never rounded down to nothing.",
        },
        {
          kind: "text",
          content:
            "Everything else follows from it. A risk score computed while a check was unavailable is reported as a **ceiling** rather than a number. A comparison with nothing to compare against returns nothing rather than \"no changes\". A page with no live source says so instead of showing a plausible placeholder.",
        },
        {
          kind: "heading", id: "upstream-nulls", content: "The subtle version" },
        {
          kind: "text",
          content:
            "The hard case is not a source that fails — it is a source that succeeds and returns nothing. An explorer answering `200 OK` with an empty verification field is not saying \"unknown\"; it is saying the contract is unverified, which is a finding.",
        },
        {
          kind: "text",
          content:
            "Reading that emptiness as \"no data\" produced no finding at all, and an unverified token scored identically to a verified one. When a source answers successfully with an empty field, something has to decide what the emptiness means.",
        },
      ],
    },
    {
      slug: "architecture",
      title: "Architecture",
      description:
        "How a request becomes a report: routing, agents, evidence, and the summary written last.",
      blocks: [
        {
          kind: "text",
          content:
            "One request in, one report out. What happens between is a pipeline with clearly separated stages, and the separation is what keeps generated prose from contaminating observed fact.",
        },
        { kind: "heading", id: "stages", content: "The stages" },
        {
          kind: "definitions",
          items: [
            {
              term: "1 · Routing",
              description:
                "The request is classified. A 42-character hex string is an address; text is read to work out what kind of subject it names.",
            },
            {
              term: "2 · Planning",
              description:
                "A workflow is resolved against what is actually available. A step whose source is unreachable is skipped and recorded as skipped — not silently omitted.",
            },
            {
              term: "3 · Execution",
              description:
                "Independent steps run together, dependent ones after. A failing step does not fail the task; it produces an unknown.",
            },
            {
              term: "4 · Evidence",
              description:
                "Each observation is stored with its source URL and its state — confirmed, refuted, or unknown.",
            },
            {
              term: "5 · Scoring",
              description:
                "Pure functions over the collected facts. The same rules judge a token analysed alone and a token screened inside a portfolio.",
            },
            {
              term: "6 · Summary",
              description:
                "Written last, over findings that already exist. It can be absent — and says so — without invalidating anything above it.",
            },
          ],
        },
        { kind: "heading", id: "agents", content: "Agents" },
        {
          kind: "text",
          content:
            "An agent is a specialist: one gathers market data, another screens contract powers, another reads a project's public presence. They are independent by design, so losing one costs you that agent's findings and nothing else.",
        },
        { kind: "heading", id: "confidence", content: "Confidence" },
        {
          kind: "text",
          content:
            "A report's confidence is derived from what actually ran rather than asserted. When nothing could be established it is reported as **unknown** rather than **low** — low implies a weak answer, and there was no answer.",
        },
      ],
    },
    {
      slug: "live-data",
      title: "How live data works",
      description:
        "Where the numbers come from, when they are cached, and what happens when a source is unavailable.",
      blocks: [
        {
          kind: "text",
          content:
            "Every figure Molthood reports about a subject was fetched from a live source during the run that produced it. Nothing is seeded, sampled, or filled in from a previous analysis.",
        },
        { kind: "heading", id: "sources", content: "Independent sources" },
        {
          kind: "text",
          content:
            "Several sources are consulted per run, and they are independent on purpose: a figure confirmed by two is stronger than a figure asserted by one, and a disagreement between them is itself a finding.",
        },
        {
          kind: "text",
          content:
            "Sources are named by the **role** they play — chain explorer, chain node, market data, security screening — rather than by supplier. A supplier can be replaced; the role is the part that matters to you, and every finding still carries the link you can check it against.",
        },
        { kind: "heading", id: "freshness", content: "Freshness" },
        {
          kind: "text",
          content:
            "Chain state moves continuously. Robinhood Chain produces blocks roughly ten times a second, so a block height is stale the moment it is printed. Figures derived from it — balances, holder counts, liquidity — are accurate as of the run, not as of now.",
        },
        {
          kind: "text",
          content:
            "Repeated identical analyses share a result for a short window rather than re-running. This is why a second request returns instantly, and why re-checking something you just checked will not show a change that happened seconds ago.",
        },
        { kind: "heading", id: "failure", content: "When a source is unavailable" },
        {
          kind: "text",
          content:
            "The run continues. The step that depended on that source produces an unknown, the report says which check did not run and why, and the score becomes a ceiling rather than a value.",
        },
        {
          kind: "callout",
          tone: "note",
          content:
            "This is the behaviour to look for when judging any analysis tool. Unplug a source and see whether the result changes. If it does not, the result was never about that source.",
        },
      ],
    },
    {
      slug: "supported-chains",
      title: "Supported chains",
      description:
        "Molthood is built for Robinhood Chain. What that means, and what it does not.",
      blocks: [
        {
          kind: "text",
          content:
            "Molthood analyses **Robinhood Chain**, an EVM-compatible network with chain ID `4663`. On-chain analysis — tokens, wallets, contracts, transactions — is scoped to it.",
        },
        {
          kind: "heading", id: "why-one-chain", content: "Why one chain" },
        {
          kind: "text",
          content:
            "Depth over breadth. Reliable analysis depends on knowing which explorer indexes what, which liquidity venues are real, and how a specific network behaves. Spreading that across a dozen chains produces a tool that is shallow everywhere.",
        },
        {
          kind: "heading", id: "off-chain", content: "Off-chain is not limited" },
        {
          kind: "text",
          content:
            "Website research, documentation analysis and general questions are not chain-scoped. Molthood Agent will answer about other ecosystems from general knowledge — and will label it as general knowledge rather than as a live check.",
        },
        {
          kind: "callout",
          tone: "note",
          title: "Asking about another chain",
          content:
            "You will get an answer, and it will tell you it is not backed by a live check on that network. That distinction is the point.",
        },
      ],
    },
    {
      slug: "supported-apis",
      title: "Supported APIs",
      description:
        "Which capabilities the platform can call, and how it behaves when one of them is not configured.",
      blocks: [
        {
          kind: "text",
          content:
            "Molthood's integrations are organised by **capability** rather than by supplier. A capability is a thing that can be done — read a page, search the web, screen a contract — and more than one source may be able to do it.",
        },
        { kind: "heading", id: "capabilities", content: "Capabilities" },
        {
          kind: "definitions",
          items: [
            { term: "Chain state", description: "Balances, blocks, transactions, gas, contract source and verification status." },
            { term: "Market data", description: "Price, liquidity, volume, pool composition and holder distribution." },
            { term: "Security screening", description: "Contract powers: mint authority, pause switches, transfer restrictions, ownership." },
            { term: "Web search", description: "Finding what has been published about a subject." },
            { term: "Page retrieval", description: "Reading a page, including ones that need a browser to render." },
            { term: "Site mapping", description: "Discovering a site's structure before deciding what is worth reading." },
            { term: "Domain records", description: "Registration, certificates, mail posture and archive history." },
            { term: "Code execution", description: "Running analysis over collected data in an isolated sandbox." },
            { term: "Summarisation", description: "Turning findings into prose, after the findings exist." },
          ],
        },
        { kind: "heading", id: "degradation", content: "Missing a capability" },
        {
          kind: "text",
          content:
            "The platform is fully functional with **zero** credentials configured. It starts, it serves, and it routes around whatever is absent. Adding a credential and restarting is the only enablement step — there is no code path that a new one switches on.",
        },
        {
          kind: "text",
          content:
            "Where several sources serve one capability, losing one loses that source and not the run. Where only one does, the capability becomes unavailable and every finding that depended on it becomes an explicit unknown.",
        },
        {
          kind: "text",
          content:
            "Availability is a state with distinct values, not a boolean: a missing credential is a deployment task, a rate limit clears by itself, and an outage is somebody else's problem. Collapsing them would repeat exactly the mistake the evidence model exists to prevent.",
        },
      ],
    },
  ],
};
