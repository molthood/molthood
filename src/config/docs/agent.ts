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

        { kind: "heading", id: "choosing-a-model", content: "Choosing a model" },
        {
          kind: "text",
          content:
            "A selector under the composer switches between available models, and your choice is remembered. Reasoning models think before answering and are worth the wait on analysis; direct models are faster and better suited to writing and code.",
        },
        {
          kind: "text",
          content:
            "The model can be changed at any point before you send a message. It is locked while an answer is streaming, so the label always names the model that produced the text on screen.",
        },

        { kind: "heading", id: "conversations", content: "Conversations" },
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
