import type { DocCategory } from "@/config/docs/types";

/** Molthood Agent: what it is, what it can be asked, and how it decides. */
export const agentDocs: DocCategory = {
  id: "molthood-agent",
  title: "Molthood Agent",
  description:
    "The conversational surface over Molthood's analysis engine — what it can do and how to ask.",
  pages: [
    {
      slug: "",
      title: "Molthood Agent",
      description:
        "Ask about a wallet, a token, a contract or a concept, and get an answer grounded in live Robinhood Chain data — or told plainly when it could not be.",
      blocks: [
        {
          kind: "text",
          content:
            "**Molthood Agent** is the conversational way into everything Molthood knows. You ask in a sentence; it decides whether the question needs live chain data, fetches it if so, and answers with the evidence attached.",
        },
        {
          kind: "text",
          content:
            "It is at [molthood.org/askmoltagent](https://molthood.org/askmoltagent). No account, no key, nothing to install.",
        },

        { kind: "heading", id: "how-it-works", content: "How it works" },
        {
          kind: "text",
          content:
            "Most assistants answer every question the same way: from what the model already knows. That works for concepts and fails badly for anything specific, because a model has never seen the token you are asking about and will produce a confident description of it anyway.",
        },
        {
          kind: "text",
          content:
            "Molthood Agent routes instead. A question about a **specific subject** — an address, a ticker, a site — reaches Molthood's analysis engine, and the answer is built from what came back. A question about a **concept** is answered directly, because there is nothing to look up.",
        },
        {
          kind: "definitions",
          items: [
            {
              term: "Live data first",
              description:
                "If Molthood can check something, it checks it. The Agent does not describe what it would look up — it looks it up.",
            },
            {
              term: "Evidence, not assertion",
              description:
                "Findings arrive with the source they came from, so anything it tells you about a subject can be verified independently.",
            },
            {
              term: "Reasoning last",
              description:
                "The model interprets what was found. It does not supply the facts.",
            },
          ],
        },

        {
          kind: "heading",
          id: "when-a-check-cannot-run",
          content: "When a check cannot run",
        },
        {
          kind: "text",
          content:
            "This is the part worth reading twice. Sources fail, allowances run out, and a subject sometimes has nothing published about it. When that happens the Agent **says so**.",
        },
        {
          kind: "callout",
          tone: "warning",
          title: "A check that could not run is not a check that came back clean",
          content:
            "Ask whether a token is safe while a check is unavailable, and the answer begins with the fact that it could not be established — not with a reassuring silence. Absence of a finding is never presented as absence of a problem.",
        },
        {
          kind: "text",
          content:
            "The same applies to general knowledge. Where the Agent is reasoning rather than reporting, it labels that clause as such, so you always know which half of an answer is checkable.",
        },

        { kind: "heading", id: "what-you-can-ask", content: "What you can ask" },
        {
          kind: "definitions",
          items: [
            {
              term: "Wallet analysis",
              description:
                "What an address holds, how it is distributed, and what about it could not be established.",
            },
            {
              term: "Token analysis",
              description:
                "Supply, holders, liquidity, market figures, and the contract powers that affect whether you can sell.",
            },
            {
              term: "Contract explanation",
              description:
                "What a contract does in plain language, including the authorities it grants whoever controls it.",
            },
            {
              term: "Risk analysis",
              description:
                "A score with the signals behind it, and an explicit ceiling when a check was unavailable.",
            },
            {
              term: "Transaction explanation",
              description: "What actually happened in a transaction, step by step.",
            },
            {
              term: "Website research",
              description:
                "A project's public presence: what it publishes, what its domain records say, and what it omits.",
            },
            {
              term: "Documentation summarisation",
              description:
                "The substance of a long document, plus the questions it leaves unanswered.",
            },
            {
              term: "Protocol comparison",
              description: "Two subjects side by side, with the differences that matter named.",
            },
            {
              term: "Portfolio insights",
              description:
                "How a set of holdings looks together, and which position is the weakest link.",
            },
            {
              term: "Market research",
              description: "Context around a sector, a narrative, or a category of token.",
            },
            {
              term: "Content generation",
              description:
                "X threads, token descriptions, documentation and code — written from real findings rather than invented ones.",
            },
            {
              term: "General AI chat",
              description:
                "Trading concepts, DeFi mechanics, tokenomics, code review, and anything else you would ask a capable assistant.",
            },
          ],
        },

        { kind: "heading", id: "example-prompts", content: "Example prompts" },
        {
          kind: "list",
          items: [
            "Analyse this wallet and tell me what it holds and what you could not check: 0x…",
            "Is this token risky? Tell me what you checked and what you could not: 0x…",
            "Explain what this smart contract does, in plain language: 0x…",
            "Compare these two tokens and name the differences that matter.",
            "Research this project and tell me what is verifiable about it: example.com",
            "Explain what happened in this transaction: 0x…",
            "Summarise this documentation and tell me what it leaves unanswered.",
            "Write an X thread explaining how liquidity locks actually work.",
            "What is the current state of Robinhood Chain?",
            "What is impermanent loss, and when does it stop being impermanent?",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          title: "Give it the address",
          content:
            "A ticker is ambiguous and several tokens can share one. An address is not. If you have it, paste it — the Agent will search by ticker otherwise and tell you what it found.",
        },

        { kind: "heading", id: "models", content: "Models" },
        {
          kind: "text",
          content:
            "One Agent, several models. The selector under the composer switches between them and your choice is remembered. Only models that can actually answer are listed.",
        },
        {
          kind: "table",
          head: ["Model", "Provider", "Best for"],
          rows: [
            ["Claude Opus 5 Thinking", "Anthropic", "Deep crypto research"],
            ["Claude Sonnet 5", "Anthropic", "Fast coding and daily conversations"],
            ["GPT-5", "OpenAI", "General intelligence and coding"],
            ["Gemini 2.5 Pro", "Google", "Long documents and multimodal reasoning"],
            ["DeepSeek Reasoner", "DeepSeek", "Coding and reasoning at lower cost"],
          ],
        },
        {
          kind: "text",
          content:
            "The model can be changed at any point before you send a message. It is locked while an answer streams, so the label always names the model that produced the text on screen.",
        },

        {
          kind: "heading",
          id: "provider-routing",
          content: "Automatic provider routing",
        },
        {
          kind: "text",
          content:
            "You choose a **model**. Molthood chooses how to reach it. Each model has an ordered list of routes, and the first one that is answering serves the request.",
        },
        {
          kind: "text",
          content:
            "This matters because providers fail in ordinary ways — a quota runs out, an account runs dry, a host has a bad afternoon. When that happens the next route answers and the conversation does not notice. You are never shown a provider error for something that had an alternative.",
        },
        {
          kind: "callout",
          tone: "note",
          title: "One thing the fallback will not do",
          content:
            "Once an answer has started streaming, it will not restart elsewhere. Retrying mid-sentence would make the text contradict itself, which is worse than the failure it was avoiding.",
        },
        {
          kind: "text",
          content:
            "A provider that fails is remembered as unhealthy, so the next request skips it rather than rediscovering the outage.",
        },

        { kind: "heading", id: "internal-knowledge", content: "Internal knowledge" },
        {
          kind: "text",
          content:
            "Ask about Molthood itself — what it does, what is shipped, what is planned, how it is built — and the answer comes from **this documentation**, not from the model's memory.",
        },
        {
          kind: "text",
          content:
            "The corpus is the same data that renders these pages and the roadmap. Not a copy and not a summary, so a page cannot drift out of sync with itself. Ask what is coming next and you get what the roadmap actually says, including the reasoning behind each item.",
        },
        {
          kind: "text",
          content:
            "If something is not in the documentation, the Agent says it is not part of Molthood rather than inventing a plausible feature. A confident description of a roadmap that does not exist is the one failure this product cannot afford.",
        },

        { kind: "heading", id: "artifacts", content: "Files and artifacts" },
        {
          kind: "text",
          content:
            "Ask for a document and you get a file rather than four thousand words in a chat bubble. Say \"export this as a PDF\", \"generate a CSV\", \"write a whitepaper\" — or just ask for something that is obviously a document, and one is produced.",
        },
        {
          kind: "list",
          items: [
            "Markdown, plain text, JSON, CSV, HTML, SVG and Mermaid",
            "PDF and Word, built from markdown",
            "Excel, built from CSV",
            "PowerPoint, one slide per section",
          ],
        },
        {
          kind: "text",
          content:
            "A file opens in a workspace rather than downloading immediately: preview it, edit it, copy it, open it in a tab, or download it. A file you have not read is one you cannot judge.",
        },
        {
          kind: "callout",
          tone: "warning",
          content:
            "The Agent will not invent data to fill a file. A spreadsheet of made-up figures is worse than a short one, because a spreadsheet reads as measured.",
        },

        { kind: "heading", id: "memory", content: "Conversation memory" },
        {
          kind: "text",
          content:
            "The Agent remembers the conversation, so a follow-up does not have to repeat itself. \"Compare it with BTC\", \"export that to PDF\", \"is it safe to hold overnight\" — the subject carries forward from earlier turns.",
        },
        {
          kind: "text",
          content:
            "Memory survives a model change. Start on one model, switch to another mid-conversation, and the new one picks up with the subject and the history intact.",
        },
        {
          kind: "text",
          content:
            "Start a clean conversation with **New chat** at any time. Previous conversations stay in the list and can be reopened or deleted.",
        },
        {
          kind: "text",
          content:
            "Conversations are kept **in your browser**. There is no account system yet, and storing them on a server without one would mean either a shared list anyone could read or an identity nobody asked to create.",
        },
        {
          kind: "text",
          content:
            "Practically: your history follows the browser rather than you. Clearing site data clears it, and it does not appear on another device.",
        },

        { kind: "heading", id: "limits", content: "Limits" },
        {
          kind: "list",
          items: [
            "Analyses draw on a shared daily allowance. When it is spent the Agent says the check could not run rather than failing quietly.",
            "It covers Robinhood Chain. Questions about other chains are answered from general knowledge, and labelled that way.",
            "It does not give financial advice or price predictions. It explains mechanics, risks, and how to verify something yourself.",
            "Like any assistant, it can be wrong. Every claim about a subject carries a source — use them.",
          ],
        },
      ],
    },
  ],
};
