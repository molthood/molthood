import type { LucideIcon } from "lucide-react";
import {
  Braces,
  Coins,
  FileText,
  Github,
  Globe,
  PieChart,
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
    label: "Analyse wallet",
    prompt: "Analyse this wallet — what it holds, and what you could not check: ",
  },
  {
    icon: Coins,
    label: "Analyse token",
    prompt: "Analyse this token: supply, liquidity, holders and contract powers: ",
  },
  {
    icon: Search,
    label: "Research project",
    prompt: "Research this project and tell me what is verifiable about it: ",
  },
  {
    icon: Braces,
    label: "Explain smart contract",
    prompt: "Explain what this contract does and what powers it gives its owner: ",
  },
  {
    icon: FileText,
    label: "Generate X thread",
    prompt: "Write an X thread explaining ",
  },
  {
    icon: PieChart,
    label: "Portfolio review",
    prompt: "Review this portfolio and tell me where the concentrated risk is: ",
  },
  {
    icon: Coins,
    label: "Explain tokenomics",
    prompt: "Explain the tokenomics of ",
  },
  {
    icon: ShieldAlert,
    label: "Security scan",
    prompt: "Run a security scan on this contract and rank what you find: ",
  },
  {
    icon: Globe,
    label: "Website research",
    prompt: "Research this website — what it publishes and what it omits: ",
  },
  {
    icon: Github,
    label: "GitHub analysis",
    prompt: "Analyse this repository — is it actually maintained? ",
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
