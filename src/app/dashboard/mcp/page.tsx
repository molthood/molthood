import type { Metadata } from "next";

import {
  Explainer,
  PageHead,
  Panel,
  IllustrativeCode,
} from "@/components/dashboard/status-badge";

export const metadata: Metadata = { title: "MCP server" };

export default function Page() {
  return (
    <div className="flex flex-col gap-8">
      <PageHead title="MCP server" status="planned">
        Let a compatible AI client run Molthood workflows directly and read the evidence.
      </PageHead>

      <Explainer what="A server exposing Molthood executions as tools an assistant can call." why="Today an assistant can describe what an analysis would find. Through MCP it performs the analysis and reads what was actually established, including what could not be checked." enables={["Execute", "Read evidence", "Fetch artifacts", "List providers"]} />

      <Panel title="Configuration" description="How a compatible client will point at the server.">
        <IllustrativeCode
          label="mcp.json"
          code={`{
  "mcpServers": {
    "molthood": {
      "command": "npx",
      "args": ["-y", "@molthood/mcp"],
      "env": { "MOLTHOOD_API_KEY": "mk_live_..." }
    }
  }
}`}
        />
      </Panel>

      <Panel title="Transport and clients" description="Planned support.">
        <div className="flex flex-wrap gap-1.5">
          {["stdio", "HTTP", "Claude", "Cursor", "VS Code", "Any MCP client"].map(
            (item) => (
              <span
                key={item}
                className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted"
              >
                {item}
              </span>
            ),
          )}
        </div>
      </Panel>

      <Panel title="Not available yet" description="No server is published and no endpoint accepts connections.">
        <p className="text-xs font-medium text-muted">There is nothing to configure here yet.</p>
      </Panel>
    </div>
  );
}
