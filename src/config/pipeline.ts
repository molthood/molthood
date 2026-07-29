import {
  ClipboardCheck,
  Cpu,
  FileText,
  MessageSquare,
  Network,
  type LucideIcon,
} from "lucide-react";

export type PipelineStage = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

/** The five stages every Molthood request passes through. */
export const pipelineStages: PipelineStage[] = [
  {
    id: "input",
    label: "Input",
    description: "A single natural-language request enters the platform.",
    icon: MessageSquare,
  },
  {
    id: "agents",
    label: "Multiple AI Agents",
    description: "The request is decomposed and routed to specialised agents.",
    icon: Network,
  },
  {
    id: "engine",
    label: "Execution Engine",
    description: "Approved steps run against Robinhood Chain in order.",
    icon: Cpu,
  },
  {
    id: "evidence",
    label: "Evidence Collection",
    description: "Every step emits a verifiable artifact as it completes.",
    icon: ClipboardCheck,
  },
  {
    id: "report",
    label: "Final Report",
    description: "Results are compiled into one auditable execution record.",
    icon: FileText,
  },
];
