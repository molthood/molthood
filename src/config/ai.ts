import type { LucideIcon } from "lucide-react";
import {
  Braces,
  Code2,
  FileText,
  GitCompare,
  Receipt,
  Search,
  ShieldAlert,
  Wallet,
} from "lucide-react";

/** Content for the Molthood Agent surface. Editing this file changes the page. */

export const AI_NAME = "Molthood Agent";

export const AI_TAGLINE =
  "Ask about Robinhood Chain, a wallet, a token, a contract — or anything crypto.";

export type ExamplePrompt = {
  icon: LucideIcon;
  label: string;
  /** What is actually sent. The label is the short form of it. */
  prompt: string;
};

/**
 * Starters, chosen to demonstrate the tools rather than the model.
 *
 * Each one either reaches Molthood's backend or shows the assistant declining
 * to invent something — which is the more useful demonstration of the two.
 */
export const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    icon: Wallet,
    label: "Analyse a wallet",
    prompt:
      "Analyse this wallet and tell me what it actually holds and what you could not check: ",
  },
  {
    icon: Search,
    label: "Research a project",
    prompt: "Research this project and tell me what is verifiable about it: ",
  },
  {
    icon: Braces,
    label: "Explain a smart contract",
    prompt: "Explain what this smart contract does, in plain language: ",
  },
  {
    icon: GitCompare,
    label: "Compare two tokens",
    prompt: "Compare these two tokens and name the differences that matter: ",
  },
  {
    icon: ShieldAlert,
    label: "Is this token risky?",
    prompt:
      "Is this token risky? Tell me what you checked, what you could not check, and why: ",
  },
  {
    icon: FileText,
    label: "Create an X thread",
    prompt: "Write an X thread explaining ",
  },
  {
    icon: Receipt,
    label: "Explain a transaction",
    prompt: "Explain what happened in this transaction: ",
  },
  {
    icon: Code2,
    label: "Summarise documentation",
    prompt: "Summarise this documentation and tell me what it leaves unanswered: ",
  },
];

/** Shown once, under the composer on an empty chat. */
export const AI_CAPABILITIES = [
  "Wallet, token and contract analysis",
  "Risk signals with their evidence",
  "Contract and transaction explanation",
  "Protocol comparison and research",
  "Code, docs and post generation",
  "Trading and DeFi concepts",
];
