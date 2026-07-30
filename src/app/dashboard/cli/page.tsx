import type { Metadata } from "next";

import {
  Explainer,
  PageHead,
  Panel,
  IllustrativeCode,
} from "@/components/dashboard/status-badge";

export const metadata: Metadata = { title: "CLI" };

export default function Page() {
  return (
    <div className="flex flex-col gap-8">
      <PageHead title="CLI" status="planned">
        Run executions and pull artifacts from a terminal, or from a build step.
      </PageHead>

      <Explainer what="A single binary speaking to the same API, with local credentials and machine-readable output." why="Some checks belong in CI rather than a browser: a contract analysed on every deploy, a report attached to a release." enables={["login", "init", "execute", "report", "artifacts", "providers", "version"]} />

      <Panel title="Commands" description="The intended surface. None of these exist yet.">
        <IllustrativeCode
          label="terminal"
          code={`molthood login                 # store credentials for this machine
molthood init                  # create molthood.json in the current project
molthood execute 0x...         # run an analysis and print the findings
molthood report <execution>    # render a report
molthood artifacts <execution> # download every file a run produced
molthood providers             # what this deployment can currently do
molthood version`}
        />
      </Panel>

      <Panel title="Installation" description="Package names are reserved intentions, not published artifacts.">
        <IllustrativeCode
          label="install"
          code={`npm  install -g @molthood/cli
brew install molthood/tap/molthood
curl -fsSL https://molthood.org/install.sh | sh`}
        />
      </Panel>

      <Panel title="Not available yet" description="Not published. The commands below describe the intended surface.">
        <p className="text-xs font-medium text-muted">There is nothing to configure here yet.</p>
      </Panel>
    </div>
  );
}
