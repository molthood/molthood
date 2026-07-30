import type { Metadata } from "next";

import {
  Explainer,
  PageHead,
  Panel,
  IllustrativeCode,
} from "@/components/dashboard/status-badge";

export const metadata: Metadata = { title: "SDK" };

export default function Page() {
  return (
    <div className="flex flex-col gap-8">
      <PageHead title="SDK" status="planned">
        Typed clients for TypeScript, Python, and Go, generated from the same contract the API serves.
      </PageHead>

      <Explainer what="A thin client over the REST API with types that match the response shape exactly." why="A field that moves should break at compile time in your editor, not at runtime in production. Hand-written types drift; generated ones cannot." enables={["TypeScript", "Python", "Go", "Typed responses", "Streaming", "Retries", "Pagination"]} />

      <Panel title="Usage" description="The intended shape, in three languages.">
        <div className="flex flex-col gap-3">
          <IllustrativeCode
            label="TypeScript"
            code={`import { Molthood } from "@molthood/sdk";

const client = new Molthood({ apiKey: process.env.MOLTHOOD_API_KEY });

const execution = await client.executions.create({
  target: "token",
  subject: "0x...",
});

for (const finding of execution.evidence) {
  // \`state\` is confirmed, refuted, or unknown — never a bare boolean,
  // because "could not check" is not the same as "no".
  console.log(finding.label, finding.state, finding.sourceUrl);
}`}
          />
          <IllustrativeCode
            label="Python"
            code={`from molthood import Molthood

client = Molthood(api_key=os.environ["MOLTHOOD_API_KEY"])
execution = client.executions.create(target="token", subject="0x...")

unresolved = [f for f in execution.evidence if f.state == "unknown"]`}
          />
          <IllustrativeCode
            label="Go"
            code={`client := molthood.New(os.Getenv("MOLTHOOD_API_KEY"))

execution, err := client.Executions.Create(ctx, &molthood.ExecutionParams{
    Target:  "token",
    Subject: "0x...",
})`}
          />
        </div>
      </Panel>

      <Panel title="Installation" description="Nothing is published to these registries yet.">
        <IllustrativeCode
          label="install"
          code={`npm  install @molthood/sdk
pnpm add     @molthood/sdk
bun  add     @molthood/sdk
pip  install molthood
go get github.com/molthood/molthood-go`}
        />
      </Panel>

      <Panel title="Not available yet" description="Nothing is published to npm, PyPI, or the Go module proxy. The install commands describe intended package names.">
        <p className="text-xs font-medium text-muted">There is nothing to configure here yet.</p>
      </Panel>
    </div>
  );
}
