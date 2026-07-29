import {
  Boxes,
  Coins,
  FileCode2,
  Globe,
  Hammer,
  LineChart,
  Rocket,
  ShieldAlert,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AgentStatus = "live" | "planned";

export type AgentDefinition = {
  id: string;
  name: string;
  summary: string;
  icon: LucideIcon;
  status: AgentStatus;
  capabilities: string[];
};

/**
 * The agent roster, mirroring `GET /api/v1/agents`.
 *
 * `status` is not decoration: `live` means the backend reports the agent as
 * implemented and it will run if routed to. Six of the nine are live. The
 * remaining three are registered but return a not-implemented result, and are
 * marked `planned` here rather than described as if they worked.
 *
 * The capabilities listed for a live agent are the ones its evidence actually
 * covers. For a planned agent they describe intent.
 */
export const agents: AgentDefinition[] = [
  {
    id: "market",
    name: "Market Agent",
    summary:
      "Reads token metadata, holders, and supply from the explorer, then prices it against Codex.",
    icon: LineChart,
    status: "live",
    capabilities: ["Token metadata", "Holder distribution", "Live pricing"],
  },
  {
    id: "risk",
    name: "Risk Agent",
    summary:
      "Scores an on-chain subject from the evidence already collected, and names every signal behind the score.",
    icon: ShieldAlert,
    status: "live",
    capabilities: ["Concentration analysis", "Signal weighting", "Scored findings"],
  },
  {
    id: "contract",
    name: "Contract Agent",
    summary:
      "Checks whether a contract is verified, and reads its published source and interface.",
    icon: FileCode2,
    status: "live",
    capabilities: ["Verification state", "Source retrieval", "Interface reading"],
  },
  {
    id: "project",
    name: "Project Agent",
    summary:
      "Reports the state of the chain itself — block height, throughput, and network activity.",
    icon: Boxes,
    status: "live",
    capabilities: ["Chain statistics", "Network activity", "Wallet holdings"],
  },
  {
    id: "site",
    name: "Site Agent",
    summary:
      "Reads a project's off-chain footprint: published policies, DNS and mail posture, domain registration, and archive history.",
    icon: Globe,
    status: "live",
    capabilities: ["Published policies", "DNS posture", "Registration and archive"],
  },
  {
    id: "launch",
    name: "Launch Agent",
    summary:
      "Takes a token or product from configuration to a verified on-chain deployment without manual scripting.",
    icon: Rocket,
    status: "planned",
    capabilities: ["Deploy pipeline", "Parameter validation", "Post-launch checks"],
  },
  {
    id: "builder",
    name: "Builder Agent",
    summary:
      "Scaffolds integrations and internal tooling against the Molthood execution API.",
    icon: Hammer,
    status: "planned",
    capabilities: ["Codegen", "Integration tests", "API bindings"],
  },
  {
    id: "portfolio",
    name: "Portfolio Agent",
    summary:
      "Screens every token a wallet holds against the same rules a full token analysis applies, worst position first.",
    icon: Coins,
    status: "live",
    capabilities: ["Holding screen", "Exposure ranking", "Shared scoring"],
  },
  {
    id: "community",
    name: "Community Agent",
    summary:
      "Drafts, schedules, and evidences external communication tied to real execution events.",
    icon: Users,
    status: "planned",
    capabilities: ["Event triggers", "Draft generation", "Publish log"],
  },
];
