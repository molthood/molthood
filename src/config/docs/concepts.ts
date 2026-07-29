import type { DocCategory } from "@/config/docs/types";

export const concepts: DocCategory = {
  id: "concepts",
  title: "Core concepts",
  description:
    "The five ideas the rest of the platform is built on. Read Evidence first — everything else follows from it.",
  pages: [
    {
      slug: "evidence",
      title: "Evidence",
      description:
        "Findings are confirmed, refuted, or unknown. A check that could not run never renders as one that came back clean.",
      blocks: [
        {
          kind: "text",
          content:
            "This is the rule the product exists to enforce, so it is worth understanding before anything else.",
        },
        {
          kind: "text",
          content:
            "A check has three possible outcomes, not two:",
        },
        {
          kind: "definitions",
          items: [
            {
              term: "confirmed",
              description: "The check ran and the claim holds.",
            },
            {
              term: "refuted",
              description: "The check ran and the claim does not hold. This is a real negative result.",
            },
            {
              term: "unknown",
              description:
                "The check could not run. `reason` says why — an unverified contract, a missing credential, an upstream outage.",
            },
          ],
        },
        {
          kind: "callout",
          tone: "danger",
          title: "unknown is not a no",
          content:
            "Collapsing `unknown` into `refuted` is the single most common way a security tool lies to you. It turns \"we could not look\" into \"we looked and it was fine\" — the two things a reader most needs to tell apart.",
        },
        { kind: "heading", id: "where-it-keeps-breaking", content: "Where this keeps breaking" },
        {
          kind: "text",
          content:
            "The subtle case is not an error — it is a **successful response with an empty field**. A chain explorer returns HTTP 200 with `is_verified: null` for a contract it has no record of. Reading that as \"not verified\" is wrong; reading it as nothing at all is worse, because then no finding is produced and an unverified token scores identically to a verified one.",
        },
        {
          kind: "text",
          content:
            "When a source answers successfully with an empty field, the emptiness has to mean something explicit. That decision is made once, at the point of reading, and never left to fall through.",
        },
        { kind: "heading", id: "the-consequences", content: "What follows from it" },
        {
          kind: "text",
          content:
            "Every feature added since inherits this rule:",
        },
        {
          kind: "list",
          items: [
            "A portfolio screen that could not run every check reports its score as a **ceiling** — `is_upper_bound` is true, and the real score can only be lower.",
            "A comparison with nothing to compare against returns nothing, rather than the words \"no changes\".",
            "An execution with no summary credential reports `summary_status: not_configured` instead of generating filler.",
            "A workflow step that could not run appears in the timeline **with its reason**, rather than being omitted.",
            "Confidence is `unknown` rather than `low` when nothing was established at all.",
          ],
        },
        { kind: "heading", id: "reading-a-finding", content: "Reading a finding" },
        {
          kind: "code",
          label: "evidence item",
          content: `{
  "id": "ev_...",
  "stage": "evidence",
  "kind": "contract:verified",
  "label": "Contract source verified",
  "value": null,
  "state": "unknown",
  "reason": "The explorer has no source for this address.",
  "source_url": "https://robinhoodchain.blockscout.com/address/0x...",
  "created_at": "2026-07-29T09:40:20Z"
}`,
        },
        {
          kind: "text",
          content:
            "`source_url` is what makes a finding checkable independently. It is always present when the source has an addressable page — a claim you cannot verify is worth very little.",
        },
      ],
    },
    {
      slug: "execution-model",
      title: "Execution model",
      description:
        "One request in, one report out: how routing, agents, and the pipeline turn text into findings.",
      blocks: [
        {
          kind: "text",
          content:
            "An execution moves through five stages, and every stage reports whether it succeeded, how long it took, and what it produced.",
        },
        {
          kind: "definitions",
          items: [
            { term: "input", description: "The request is classified and a target is extracted." },
            { term: "agents", description: "The agents that can serve that target are selected." },
            { term: "engine", description: "Agents run — independent work concurrently, dependent work after." },
            { term: "evidence", description: "Findings are collected, deduplicated, and scored." },
            { term: "report", description: "The result is assembled, and a summary is written if configured." },
          ],
        },
        { kind: "heading", id: "routing", content: "Routing" },
        {
          kind: "text",
          content:
            "You can name a target directly — `/api/v1/token/0x…` — or send free-form text to `/api/v1/execute` and let the router decide. An address that is a contract routes differently from one that is a wallet, which is why the router reads the chain before committing.",
        },
        {
          kind: "text",
          content:
            "If the router cannot identify a target, the run fails cleanly with a reason. It does not guess.",
        },
        { kind: "heading", id: "failure-is-partial", content: "Failure is partial" },
        {
          kind: "text",
          content:
            "A failing step does not fail the task. One source being unreachable costs you that source's findings and nothing else — the rest of the report still arrives, and the missing part is named rather than silently absent.",
        },
        {
          kind: "callout",
          tone: "note",
          title: "This is why the timeline matters",
          content:
            "`stages[]` and `tasks[]` in the response tell you what actually ran. A report that hid its skipped steps could not be checked: you could not tell thorough coverage from a missing key.",
        },
        { kind: "heading", id: "caching", content: "Caching" },
        {
          kind: "text",
          content:
            "An identical analysis inside ten minutes returns the stored result. Two identical requests arriving at the same time share one execution rather than doing the work twice.",
        },
      ],
    },
    {
      slug: "agents",
      title: "Agents",
      description:
        "Nine agents, six implemented. What each one collects, and what it needs to be able to run.",
      blocks: [
        {
          kind: "text",
          content:
            "An agent owns one kind of question. A single analysis usually runs several: a token analysis runs the market agent and the risk agent, and the risk agent scores what the others found.",
        },
        {
          kind: "table",
          head: ["Agent", "What it collects", "Status"],
          rows: [
            ["`market`", "Token identity, supply, holders, price and market data", "Implemented"],
            ["`contract`", "Verification, source availability, owner powers", "Implemented"],
            ["`risk`", "Scores everything the others found, into signals and a level", "Implemented"],
            ["`portfolio`", "Screens each token a wallet holds, using the same rules", "Implemented"],
            ["`project`", "Chain-level statistics and network health", "Implemented"],
            ["`site`", "Domain age, certificates, archives, page claims", "Implemented"],
            ["`launch`", "Registered, not implemented — it cannot be executed", "Planned"],
            ["`builder`", "Registered, not implemented", "Planned"],
            ["`community`", "Registered, not implemented", "Planned"],
          ],
        },
        {
          kind: "callout",
          tone: "note",
          title: "Planned agents are visible on purpose",
          content:
            "They appear in `/api/v1/agents` with `implemented: false` and a status of `not_implemented`. Hiding them would be tidier; showing them is honest about what the platform can and cannot do today.",
        },
        { kind: "heading", id: "one-set-of-rules", content: "One set of scoring rules" },
        {
          kind: "text",
          content:
            "The risk agent and the portfolio agent call the **same pure functions** over the same facts. A token screened inside a wallet is judged exactly as one analysed on its own — there is no second copy of a rule written for a new surface.",
        },
        { kind: "heading", id: "status", content: "Agent status" },
        {
          kind: "text",
          content:
            "`status` is derived from the live health of the services an agent depends on, not from stored metrics:",
        },
        {
          kind: "definitions",
          items: [
            { term: "active", description: "Implemented, and every dependency is answering." },
            { term: "degraded", description: "Implemented, but a dependency is not live. It will produce fewer findings." },
            { term: "not_implemented", description: "Registered in the runtime with no implementation. It cannot run." },
          ],
        },
      ],
    },
    {
      slug: "risk-scoring",
      title: "Risk scoring",
      description:
        "How a score is produced, why higher means safer, and what a ceiling score means.",
      blocks: [
        {
          kind: "callout",
          tone: "warning",
          title: "Higher is safer",
          content:
            "The scale runs 0–100 where 100 is the safest. This is the opposite of most \"risk scores\", so the level is always shown beside the number.",
        },
        {
          kind: "table",
          head: ["Score", "Level"],
          rows: [
            ["80 – 100", "`low`"],
            ["60 – 79", "`moderate`"],
            ["35 – 59", "`elevated`"],
            ["0 – 34", "`high`"],
          ],
        },
        { kind: "heading", id: "signals", content: "Signals" },
        {
          kind: "text",
          content:
            "A score is not a black box. It is produced by weighted signals, and each one appears in the response with its severity and an explanation:",
        },
        {
          kind: "code",
          label: "facts.risk",
          content: `{
  "score": 70,
  "level": "moderate",
  "signals_count": 3,
  "signals": [
    {
      "code": "contract_unverified",
      "severity": "high",
      "detail": "No published source to read.",
      "weight": 18
    }
  ],
  "basis": "…what the score was computed from"
}`,
        },
        { kind: "heading", id: "ceiling-scores", content: "Ceiling scores" },
        {
          kind: "text",
          content:
            "When a check could not run, the score it would have affected is missing — so the score shown can only be **too generous**, never too harsh. In a portfolio screen this is explicit:",
        },
        {
          kind: "definitions",
          items: [
            {
              term: "is_upper_bound",
              description:
                "True when a check was missed. The real score is this or lower — never higher.",
            },
            {
              term: "checks_missed[]",
              description: "Which checks did not run, by name.",
            },
            {
              term: "score: null",
              description:
                "Nothing could be established at all. Not zero, which would read as the worst possible result, and not a hundred.",
            },
          ],
        },
        {
          kind: "text",
          content:
            "This follows directly from [Evidence](/docs/concepts/evidence): a score built on checks that did not run is a claim the platform cannot make.",
        },
      ],
    },
    {
      slug: "providers",
      title: "Providers and capabilities",
      description:
        "Why the platform runs with zero credentials, and what adding a key actually changes.",
      blocks: [
        {
          kind: "text",
          content:
            "The platform is **fully functional with no credentials at all**. It starts, it reports which variables would enable what, and it routes around whatever is absent. Adding a key and restarting is the only enablement step — there is no code path a new key unlocks.",
        },
        { kind: "heading", id: "capabilities-not-vendors", content: "Capabilities, not vendors" },
        {
          kind: "text",
          content:
            "A caller asks for a **capability** — search the web, read a page, run code — and a manager picks who serves it. Several providers can answer the same capability, so losing one to a missing key loses that provider, not the run.",
        },
        {
          kind: "text",
          content:
            "Ordering encodes cost as well as ability: a provider that reads a page for free is tried before one that renders it in a browser and bills for it.",
        },
        { kind: "heading", id: "six-states", content: "Six states, not a boolean" },
        {
          kind: "text",
          content:
            "\"Unavailable\" is not one thing, and collapsing the cases would repeat the mistake the evidence model exists to prevent:",
        },
        {
          kind: "table",
          head: ["State", "Meaning", "Who fixes it"],
          rows: [
            ["`healthy`", "Answering, and recently verified", "—"],
            ["`enabled`", "Usable, no credential needed", "—"],
            ["`missing_key`", "A credential is not set", "A deployment task"],
            ["`rate_limited`", "Throttled upstream", "Clears on its own"],
            ["`unavailable`", "The upstream is down", "The upstream"],
            ["`disabled`", "Switched off deliberately", "An operator"],
          ],
        },
        { kind: "heading", id: "previewing-a-plan", content: "Previewing a plan" },
        {
          kind: "text",
          content:
            "Before spending anything, you can ask what a request would do on this deployment — which steps would run, which are blocked, and which variable would unblock them.",
        },
        {
          kind: "code",
          label: "curl",
          content: `curl "https://api.molthood.org/api/v1/providers/plan?request=audit%20https://example.com"`,
        },
        {
          kind: "callout",
          tone: "note",
          content:
            "The preview is free and calls no provider. It answers the only question that decides whether to spend: what will actually run here.",
        },
      ],
    },
  ],
};
