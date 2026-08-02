/**
 * The models Molthood Agent offers, as the interface describes them.
 *
 * Separate from `providers/registry.ts` on purpose: that module reads provider
 * keys from the environment, and importing it into a client component would
 * drag those reads into the browser bundle. This half is display only and
 * safe anywhere; the registry attaches the routes.
 */

import type { ModelBadge, ModelProvider, ModelSkills } from "@/lib/ai/providers/types";

export type DisplayModel = {
  id: string;
  label: string;
  provider: ModelProvider;
  description: string;
  /** The one-line "best for", shown under the name. */
  bestFor: string;
  contextTokens: number;
  badges: ModelBadge[];
  skills: ModelSkills;
};

/** Every model here streams, calls tools, and reasons. Only vision varies. */
const TEXT_SKILLS: ModelSkills = {
  streaming: true,
  vision: false,
  files: true,
  tools: true,
  reasoning: true,
};

const MULTIMODAL_SKILLS: ModelSkills = { ...TEXT_SKILLS, vision: true };

export const CURATED_MODELS: DisplayModel[] = [
  {
    id: "claude-opus-5-thinking",
    label: "Claude Opus 5 Thinking",
    provider: "anthropic",
    description: "Reasons at length before answering.",
    bestFor: "Best for deep crypto research.",
    contextTokens: 1_000_000,
    badges: ["Reasoning", "Premium"],
    skills: TEXT_SKILLS,
  },
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    provider: "anthropic",
    description: "Answers directly, at a lower cost per turn.",
    bestFor: "Fast coding and daily conversations.",
    contextTokens: 1_000_000,
    badges: ["Fast", "Coding"],
    skills: TEXT_SKILLS,
  },
  {
    id: "gemini-pro",
    label: "Gemini 2.5 Pro",
    provider: "google",
    description: "Reads very long inputs, including images.",
    bestFor: "Best for long documents and multimodal reasoning.",
    contextTokens: 1_000_000,
    badges: ["Research", "Long context"],
    skills: MULTIMODAL_SKILLS,
  },
  {
    id: "deepseek-reasoner",
    label: "DeepSeek Reasoner",
    provider: "deepseek",
    description: "Strong reasoning at a fraction of the cost.",
    bestFor: "Excellent coding and reasoning performance.",
    contextTokens: 1_000_000,
    badges: ["Coding", "Fast"],
    skills: TEXT_SKILLS,
  },
  {
    id: "gpt-5",
    label: "GPT-5",
    provider: "openai",
    description: "Broad capability across writing, code and analysis.",
    bestFor: "General intelligence and coding.",
    contextTokens: 1_000_000,
    badges: ["Coding", "Premium"],
    skills: MULTIMODAL_SKILLS,
  },
];
