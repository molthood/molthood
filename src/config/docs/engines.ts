import type { DocPage } from "@/config/docs/types";

/**
 * The four analysis engines, as concept pages.
 *
 * Exported as pages rather than as a category of their own: they belong beside
 * evidence and the execution model, because none of them makes sense without
 * those two first.
 */
export const enginePages: DocPage[] = [
  {
    slug: "research-engine",
    title: "Research engine",
    description:
      "How Molthood investigates something that is not on chain: a project, a site, a claim.",
    blocks: [
      {
        kind: "text",
        content:
          "Not everything worth checking is on chain. A project's credibility lives in what it publishes, what its domain records say, and what it conspicuously omits — and the research engine is the part of Molthood that reads all of that.",
      },
      { kind: "heading", id: "map-first", content: "Map before reading" },
      {
        kind: "text",
        content:
          "A site is mapped before anything is read. Retrieval is the expensive step, so discovering the structure first means fetching the pages that carry substance — terms, team, token, audits — rather than crawling everything and hoping.",
      },
      { kind: "heading", id: "what-it-looks-at", content: "What it looks at" },
      {
        kind: "definitions",
        items: [
          { term: "Published policy", description: "Terms, privacy, and whether either actually exists." },
          { term: "Domain records", description: "When the domain was registered, by whom, and what its certificates and mail configuration show." },
          { term: "Archive history", description: "What the site said previously. A project that recently rewrote its promises is a finding." },
          { term: "Documentation", description: "What is documented, at what depth, and which obvious questions go unanswered." },
        ],
      },
      { kind: "heading", id: "absence", content: "Absence is evidence" },
      {
        kind: "text",
        content:
          "The most useful research finding is frequently a missing one: no terms, a domain registered last week, an audit page with no audit on it. These are reported as **refuted** claims where the project asserted otherwise, and as findings in their own right where it simply stayed quiet.",
      },
      {
        kind: "callout",
        tone: "note",
        content:
          "A page that could not be fetched is not a page that does not exist. The two are reported differently, which is the whole distinction.",
      },
    ],
  },
  {
    slug: "market-engine",
    title: "Market engine",
    description:
      "Price, liquidity, volume and holder distribution — and which of those actually tells you something.",
    blocks: [
      {
        kind: "text",
        content:
          "The market engine collects the tradeable reality of a token: what it costs, how deeply it can be sold, how much of it moves, and who holds it.",
      },
      { kind: "heading", id: "liquidity", content: "Liquidity is the number that matters" },
      {
        kind: "text",
        content:
          "Market cap is the number people quote and the least informative one available — it is a price multiplied by a supply nobody is selling. Liquidity is what determines whether you can exit at anything near the quoted price.",
      },
      {
        kind: "text",
        content:
          "The ratio between them is the useful reading. A token with a large capitalisation and thin pools is a position you can enter and cannot leave.",
      },
      { kind: "heading", id: "volume", content: "Volume against liquidity" },
      {
        kind: "text",
        content:
          "Daily volume many times larger than total liquidity means the same shallow pool is being traded through repeatedly. That is a churn signature, and it is worth knowing before reading the volume as demand.",
      },
      { kind: "heading", id: "distribution", content: "Distribution" },
      {
        kind: "text",
        content:
          "Holder counts and top-holder concentration are collected together. A large holder base with most of the supply in ten addresses is a different asset from what the holder count alone suggests.",
      },
      {
        kind: "callout",
        tone: "note",
        title: "Sources can disagree",
        content:
          "An explorer's rate and a market feed's rate are often slightly different. Both are reported. A disagreement is information, and averaging it away would destroy that.",
      },
    ],
  },
  {
    slug: "wallet-intelligence",
    title: "Wallet intelligence",
    description: "What an address holds, how concentrated it is, and what cannot be seen.",
    blocks: [
      {
        kind: "text",
        content:
          "Wallet analysis answers a narrower question than people expect: what does this address hold, and how is that holding structured?",
      },
      { kind: "heading", id: "what-it-covers", content: "What it covers" },
      {
        kind: "list",
        items: [
          "Native balance and token holdings, with each token identified rather than listed as an address.",
          "Concentration — how much of the value sits in one position.",
          "Activity: transaction counts and how recently the address has been used.",
          "Screening of held tokens, using the same rules a token gets when analysed alone.",
        ],
      },
      { kind: "heading", id: "same-rules", content: "The same rules, everywhere" },
      {
        kind: "text",
        content:
          "A token screened inside a wallet is judged by exactly the same rules as one analysed on its own. There is one implementation of each rule; a second copy for a second surface is how two screens end up disagreeing about the same token.",
      },
      { kind: "heading", id: "ceiling", content: "A portfolio score is a ceiling" },
      {
        kind: "text",
        content:
          "When a holding could not be screened, the wallet's score is reported as an **upper bound**. The risk cannot be lower than shown; it may well be higher. A portfolio score that quietly ignored the position it could not check would be worse than no score.",
      },
      {
        kind: "callout",
        tone: "warning",
        title: "An address is not a person",
        content:
          "One entity may hold many addresses, and one address may be a contract, an exchange, or a precompile. Molthood reports what the address does, not who is behind it.",
      },
    ],
  },
  {
    slug: "token-intelligence",
    title: "Token intelligence",
    description:
      "Contract powers, supply mechanics, and the questions that decide whether you can sell.",
    blocks: [
      {
        kind: "text",
        content:
          "Token analysis is mostly about control. Price and supply are easy to read; what matters is who can change the rules after you buy.",
      },
      { kind: "heading", id: "powers", content: "Contract powers" },
      {
        kind: "definitions",
        items: [
          { term: "Mint authority", description: "Whether new supply can be created, and by whom." },
          { term: "Pause", description: "Whether transfers can be halted. If they can, your ability to sell is conditional on somebody's decision." },
          { term: "Transfer restrictions", description: "Blacklists, allowlists, maximum amounts, cooldowns." },
          { term: "Ownership", description: "Whether an owner exists, whether it is renounced, and whether it is identifiable at all." },
          { term: "Proxy", description: "Whether the code behind the address can be replaced with different code." },
          { term: "Taxes", description: "Fees taken on buy or sell, and whether they can be changed." },
        ],
      },
      { kind: "heading", id: "verification", content: "Verification" },
      {
        kind: "text",
        content:
          "An unverified contract is a finding, not a gap. It means the published source cannot be matched to the deployed bytecode, so none of the reassurance a source-code review would give you is available.",
      },
      {
        kind: "callout",
        tone: "warning",
        title: "The empty-field trap",
        content:
          "An explorer returning success with an empty verification field is stating that the contract is unverified. Reading that as \"no data\" once produced no finding at all, and let an unverified token score identically to a verified one.",
      },
      { kind: "heading", id: "score", content: "Reading the score" },
      {
        kind: "text",
        content:
          "Higher is safer. A score is the output of named signals with stated severities, all of which are shown — so you can disagree with the weighting and still use the evidence underneath it.",
      },
    ],
  },
];
