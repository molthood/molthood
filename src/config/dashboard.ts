import {
  Blocks,
  BookOpen,
  Code2,
  KeyRound,
  LayoutGrid,
  Map,
  Network,
  Puzzle,
  Settings2,
  Terminal,
  Webhook,
  Route,
  Gauge,
  type LucideIcon,
} from "lucide-react";

/**
 * The developer platform, as data.
 *
 * Nothing here is available yet, and the whole design problem is saying so
 * without the page reading as unfinished. Two rules do most of that work:
 *
 * - **Every page explains what the thing is for.** A page that only says
 *   "coming soon" tells a developer nothing they can act on and reads as a
 *   placeholder. A page that explains the shape of the feature is useful the
 *   day it is published.
 * - **Status is a small badge, never a banner.** A loud banner is the visual
 *   language of an unfinished project. A quiet one is the language of a
 *   roadmap.
 *
 * The example endpoints and code samples below are **illustrative and marked
 * as such**. They describe an interface that is designed but not built, which
 * is a different claim from documenting one that exists — and the difference
 * has to survive a reader skimming.
 */

export type Status = "planned" | "in-development" | "preview";

export const STATUS_LABEL: Record<Status, string> = {
  planned: "Planned",
  "in-development": "In development",
  preview: "Preview",
};

export type DashboardNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  status?: Status;
};

/** Sidebar. Every entry resolves to a real page — there are no dead links. */
export const dashboardNav: DashboardNavItem[] = [
  { label: "Overview", href: "/", icon: LayoutGrid },
  { label: "API keys", href: "/api-keys", icon: KeyRound, status: "planned" },
  { label: "REST API", href: "/rest-api", icon: Network, status: "in-development" },
  { label: "Endpoints", href: "/endpoints", icon: Route, status: "in-development" },
  { label: "SDK", href: "/sdk", icon: Code2, status: "planned" },
  { label: "CLI", href: "/cli", icon: Terminal, status: "planned" },
  { label: "MCP server", href: "/mcp", icon: Blocks, status: "planned" },
  { label: "Skills", href: "/skills", icon: Puzzle, status: "planned" },
  { label: "Webhooks", href: "/webhooks", icon: Webhook, status: "planned" },
  { label: "Usage", href: "/usage", icon: Gauge, status: "planned" },
  { label: "Changelog", href: "/changelog", icon: BookOpen },
  { label: "Roadmap", href: "/roadmap", icon: Map },
  { label: "Settings", href: "/settings", icon: Settings2, status: "planned" },
];

export type Capability = {
  title: string;
  href: string;
  icon: LucideIcon;
  status: Status;
  summary: string;
  /** What a developer will actually do with it. */
  purpose: string;
};

export const capabilities: Capability[] = [
  {
    title: "REST API",
    href: "/rest-api",
    icon: Network,
    status: "in-development",
    summary: "Run an analysis from your own code and read the result back.",
    purpose:
      "The same engine the console uses, over plain HTTP and JSON. No SDK required to start.",
  },
  {
    title: "API keys",
    href: "/api-keys",
    icon: KeyRound,
    status: "planned",
    summary: "Scoped credentials with rotation, limits, and an audit trail.",
    purpose:
      "Issue a key per environment, restrict what it can reach, and revoke it without touching the others.",
  },
  {
    title: "CLI",
    href: "/cli",
    icon: Terminal,
    status: "planned",
    summary: "Drive executions and pull artifacts from a terminal.",
    purpose:
      "Script an analysis into a build step, or check a subject without opening a browser.",
  },
  {
    title: "SDK",
    href: "/sdk",
    icon: Code2,
    status: "planned",
    summary: "Typed clients for TypeScript, Python, and Go.",
    purpose:
      "Types that match the response contract, so a field that moves breaks at compile time rather than in production.",
  },
  {
    title: "MCP server",
    href: "/mcp",
    icon: Blocks,
    status: "planned",
    summary: "Let a compatible AI client run Molthood workflows directly.",
    purpose:
      "Your assistant performs the analysis and reads the evidence, instead of describing what it would do.",
  },
  {
    title: "Skills",
    href: "/skills",
    icon: Puzzle,
    status: "planned",
    summary: "Reusable execution workflows, versioned and shareable.",
    purpose:
      "Package a sequence you run often, then install someone else's instead of rebuilding it.",
  },
  {
    title: "Webhooks",
    href: "/webhooks",
    icon: Webhook,
    status: "planned",
    summary: "Receive execution events as they happen.",
    purpose:
      "React when a run completes or a watched subject changes, without polling for it.",
  },
];

export type EndpointPreview = {
  method: "GET" | "POST" | "DELETE";
  path: string;
  description: string;
  auth: string;
  response?: string;
};

export type EndpointGroup = {
  id: string;
  title: string;
  description: string;
  endpoints: EndpointPreview[];
};

/**
 * The interface as designed. Illustrative — none of these accept requests yet.
 *
 * Shown anyway because the shape is the useful part: a developer deciding
 * whether to build on this needs to know what the surface will look like, and
 * a vague promise cannot be evaluated.
 */
export const endpointGroups: EndpointGroup[] = [
  {
    id: "executions",
    title: "Executions",
    description: "Start an analysis and read what it found.",
    endpoints: [
      {
        method: "POST",
        path: "/v1/executions",
        description: "Run an analysis against a subject.",
        auth: "API key",
        response: `{
  "id": "exe_…",
  "status": "running",
  "target": "token",
  "created_at": "…"
}`,
      },
      {
        method: "GET",
        path: "/v1/executions",
        description: "List your executions, newest first.",
        auth: "API key",
      },
      {
        method: "GET",
        path: "/v1/executions/{id}",
        description: "One execution with its evidence and sources.",
        auth: "API key",
        response: `{
  "id": "exe_…",
  "status": "succeeded",
  "evidence": [
    {
      "label": "Contract source verified",
      "state": "unknown",
      "reason": "The explorer has no source for this address."
    }
  ]
}`,
      },
    ],
  },
  {
    id: "research",
    title: "Research",
    description: "Gather and cite sources on a topic.",
    endpoints: [
      {
        method: "POST",
        path: "/v1/research",
        description: "Collect ranked sources with citations.",
        auth: "API key",
      },
      {
        method: "POST",
        path: "/v1/website-audit",
        description: "Map a site, read what matters, and report on it.",
        auth: "API key",
      },
      {
        method: "POST",
        path: "/v1/repository-analysis",
        description: "Read a repository and what is written about it.",
        auth: "API key",
      },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    description: "An execution rendered, and the files it produces.",
    endpoints: [
      {
        method: "POST",
        path: "/v1/reports",
        description: "Build a report from one or more executions.",
        auth: "API key",
      },
      {
        method: "GET",
        path: "/v1/reports/{id}",
        description: "Sections, findings, confidence, and sources.",
        auth: "API key",
      },
    ],
  },
  {
    id: "artifacts",
    title: "Artifacts",
    description: "Downloadable output: markdown, CSV, charts, bundles.",
    endpoints: [
      {
        method: "GET",
        path: "/v1/artifacts/{id}",
        description: "One artifact, with its own media type.",
        auth: "API key",
      },
      {
        method: "GET",
        path: "/v1/executions/{id}/artifacts",
        description: "Every file an execution produced.",
        auth: "API key",
      },
    ],
  },
  {
    id: "projects",
    title: "Projects",
    description: "Subjects grouped by what they are.",
    endpoints: [
      {
        method: "GET",
        path: "/v1/projects",
        description: "Everything you have analysed, grouped.",
        auth: "API key",
      },
    ],
  },
  {
    id: "providers",
    title: "Providers",
    description: "What the platform can currently do.",
    endpoints: [
      {
        method: "GET",
        path: "/v1/providers",
        description: "Capabilities available on this deployment.",
        auth: "None",
      },
    ],
  },
];

export type RoadmapEntry = {
  phase: "Now" | "Next" | "Later";
  title: string;
  description: string;
  status: Status | "shipped";
};

export const roadmap: RoadmapEntry[] = [
  {
    phase: "Now",
    title: "AI execution platform",
    description:
      "Analyse tokens, wallets, contracts, and websites, with every finding carrying the source it came from. Live today at the console.",
    status: "shipped",
  },
  {
    phase: "Next",
    title: "Developer API",
    description:
      "The same engine over HTTP, with scoped keys, documented limits, and a response contract that will not move under you.",
    status: "in-development",
  },
  {
    phase: "Later",
    title: "MCP server",
    description:
      "Compatible AI clients execute workflows through Molthood and read the evidence directly.",
    status: "planned",
  },
  {
    phase: "Later",
    title: "CLI",
    description: "Executions and artifacts from a terminal, scriptable into a build.",
    status: "planned",
  },
  {
    phase: "Later",
    title: "SDK",
    description: "Typed clients for TypeScript, Python, and Go.",
    status: "planned",
  },
  {
    phase: "Later",
    title: "Skills marketplace",
    description: "Publish, version, and install reusable execution workflows.",
    status: "planned",
  },
  {
    phase: "Later",
    title: "Webhooks",
    description: "Execution events delivered as they happen, with signed payloads.",
    status: "planned",
  },
];

export type WebhookEvent = { name: string; description: string };

export const webhookEvents: WebhookEvent[] = [
  { name: "execution.started", description: "An analysis has begun." },
  { name: "execution.completed", description: "An analysis finished successfully." },
  { name: "execution.failed", description: "An analysis stopped before completing." },
  { name: "artifact.created", description: "A file was produced by an execution." },
  { name: "report.generated", description: "A report was assembled." },
  { name: "watch.changed", description: "A watched subject moved since the last check." },
];
