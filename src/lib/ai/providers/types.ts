/**
 * The provider abstraction.
 *
 * Every provider Molthood talks to speaks the OpenAI chat-completions shape,
 * which is what makes one adapter enough. What differs between them is not the
 * protocol — it is which models they serve, what those models can do, and
 * whether the account behind the key can actually pay for a request today.
 *
 * So a provider declares capabilities rather than the caller assuming them,
 * and a *model* declares an ordered list of routes rather than a single home.
 * That second part is the whole design: a model is a thing a user chooses, and
 * a route is one way of getting it. When the preferred route is out of quota,
 * the next one answers and the conversation does not notice.
 */

export type ProviderId = "gorouter" | "google" | "deepseek" | "virtuals";

export type Capability =
  | "chat"
  | "streaming"
  | "tools"
  | "vision"
  | "reasoning";

export type Provider = {
  id: ProviderId;
  /** Shown nowhere by default. Diagnostics only — the UI names models. */
  name: string;
  baseUrl: string;
  /** Read from the environment on the server. Empty means not configured. */
  apiKey: string;
  capabilities: Capability[];
  /**
   * Some providers prefix model ids in their own catalogue
   * (`models/gemini-2.5-pro`). The route carries the id the provider wants.
   */
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsReasoning: boolean;
};

/** One way to serve a model: which provider, under which id. */
export type ModelRoute = {
  provider: ProviderId;
  /** The model id *that provider* expects, which is often not the label. */
  model: string;
};

export type ModelBadge =
  | "Reasoning"
  | "Research"
  | "Coding"
  | "Fast"
  | "Premium"
  | "Long context";

export type ModelProvider = "anthropic" | "openai" | "google" | "deepseek";

/**
 * What a model can do, as the picker states it.
 *
 * Declared per model rather than inherited from its provider: the provider
 * says what the *endpoint* supports, and a model behind that endpoint may
 * support less. Reading vision support off the host would promise something
 * the model cannot do.
 */
export type ModelSkills = {
  streaming: boolean;
  vision: boolean;
  files: boolean;
  tools: boolean;
  reasoning: boolean;
};

/** A model as the user sees it, and every way of reaching it. */
export type CatalogueModel = {
  id: string;
  label: string;
  provider: ModelProvider;
  description: string;
  /** The one-line "best for", shown under the name. */
  bestFor: string;
  contextTokens: number;
  badges: ModelBadge[];
  skills: ModelSkills;
  /**
   * Ordered. The first route whose provider is healthy serves the request; if
   * it fails mid-flight the next one is tried before the user sees anything.
   */
  routes: ModelRoute[];
};

export function isConfigured(provider: Provider): boolean {
  return provider.apiKey.length > 0 && provider.baseUrl.length > 0;
}
