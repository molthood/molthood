import {
  Bot,
  Eye,
  FolderKanban,
  History,
  Home,
  ListChecks,
  Plug,
  ScrollText,
  Sparkles,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type ConsoleNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
};

/** Sidebar navigation for the application shell. Every href resolves to a real route. */
export const consoleNav: ConsoleNavItem[] = [
  {
    label: "Home",
    href: "/console",
    icon: Home,
    description: "Overview of workspace activity.",
  },
  {
    label: "Agents",
    href: "/console/agents",
    icon: Bot,
    description: "Configure the agents available to this workspace.",
  },
  {
    label: "Projects",
    href: "/console/projects",
    icon: FolderKanban,
    description: "Group related executions under a shared objective.",
  },
  {
    label: "Tasks",
    href: "/console/tasks",
    icon: Sparkles,
    description: "Submit one task and get a structured report.",
  },
  {
    label: "Executions",
    href: "/console/executions",
    icon: ListChecks,
    description: "Inspect runs as they move through the pipeline.",
  },
  {
    label: "Watchlist",
    href: "/console/watchlist",
    icon: Eye,
    description: "Subjects re-checked on a schedule, with what changed.",
  },
  {
    label: "Reports",
    href: "/console/reports",
    icon: ScrollText,
    description: "Compiled, auditable records of completed work.",
  },
  {
    label: "History",
    href: "/console/history",
    icon: History,
    description: "A complete timeline of workspace events.",
  },
  {
    label: "Providers",
    href: "/console/providers",
    icon: Plug,
    description: "Provider health, capabilities, and missing keys.",
  },
  {
    label: "Settings",
    href: "/console/settings",
    icon: Settings,
    description: "Workspace, network, and access preferences.",
  },
];
