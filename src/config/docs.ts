import {
  BookOpen,
  Compass,
  FlaskConical,
  Rocket,
  Terminal,
  type LucideIcon,
} from "lucide-react";

export type DocsSection = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  topics: string[];
};

/**
 * Documentation sections, describing the system as it stands.
 *
 * The previous version documented a `@molthood/cli` package, a
 * `molthood auth login` flow, webhooks, approval policies, and five example
 * projects — none of which exist. A reader who followed that Quick Start would
 * have hit `npm ERR! 404` on the first command.
 */
export const docsSections: DocsSection[] = [
  {
    id: "introduction",
    title: "Introduction",
    description:
      "What Molthood is, the problem it solves, and how an execution platform differs from a prompt interface.",
    icon: BookOpen,
    topics: ["What is Molthood", "Execution model", "Evidence and sources", "Glossary"],
  },
  {
    id: "quick-start",
    title: "Quick Start",
    description:
      "Run the API and the console locally, then take a request from submission to a finished analysis.",
    icon: Rocket,
    topics: [
      "Running the service",
      "Your first analysis",
      "Reading the evidence",
      "Configuring keys",
    ],
  },
  {
    id: "guides",
    title: "Guides",
    description:
      "How the pieces fit: what each agent collects, how routing picks one, and what happens when a source is unavailable.",
    icon: Compass,
    topics: ["The agent roster", "How routing decides", "Degrading honestly", "Rate limits"],
  },
  {
    id: "api",
    title: "API",
    description:
      "The HTTP surface behind the console — every route, its parameters, and the response contract.",
    icon: Terminal,
    topics: ["Analysis routes", "Chain data", "Execution history", "Platform status"],
  },
  {
    id: "examples",
    title: "Examples",
    description:
      "Requests you can paste into a terminal right now, against the running service.",
    icon: FlaskConical,
    topics: ["Analyze a token", "Audit a website", "Free-form routing", "Chain overview"],
  },
];

/**
 * Real commands. Both servers run from the repository; there is no package to
 * install and no credential to present.
 */
export const quickStartSnippet = `# start the API
cd backend && uvicorn app.main:app     # http://127.0.0.1:8000

# start the console
npm run dev                            # http://localhost:3000

# submit a request — the router infers the target from the text
curl -X POST http://127.0.0.1:8000/api/v1/execute \\
  -H "Content-Type: application/json" \\
  -d '{ "request": "audit the site robinhood.com" }'`;
