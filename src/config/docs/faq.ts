import type { DocCategory } from "@/config/docs/types";

export const faq: DocCategory = {
  id: "faq",
  title: "FAQ",
  description:
    "The questions people actually ask, answered without hedging — including the ones with uncomfortable answers.",
  pages: [
    {
      slug: "general",
      title: "General",
      description: "What Molthood is, what it is not, and what it will not tell you.",
      blocks: [
        {
          kind: "heading",
          id: "will-it-tell-me-if-a-token-is-a-scam",
          content: "Will it tell me whether a token is a scam?",
        },
        {
          kind: "text",
          content:
            "No, and it will not pretend to. It reports what it could establish: whether the contract is verified, what powers the owner retains, whether a holder can sell, how supply is distributed. Those facts are usually enough to make a decision — but the decision is yours, and the platform does not dress a score up as a verdict.",
        },
        {
          kind: "heading",
          id: "is-a-high-score-safe",
          content: "Does a high score mean it is safe?",
        },
        {
          kind: "text",
          content:
            "It means the checks that ran found little wrong. Read the unknowns alongside it: a score of 88 with four `unknown` findings is a much weaker statement than 88 with none, because a score cannot account for checks that did not run.",
        },
        {
          kind: "heading",
          id: "why-not-a-chat-interface",
          content: "Why is there no chat interface?",
        },
        {
          kind: "text",
          content:
            "Because a conversation makes it easy to present a guess as a finding. Here, findings carry the URL they came from and the state they were established in. The one piece of model-written prose in a report is labelled as exactly that, and everything above it can be checked without trusting the model at all.",
        },
        {
          kind: "heading",
          id: "which-chain",
          content: "Which chains are supported?",
        },
        {
          kind: "text",
          content:
            "Robinhood Chain only — chain id 4663. The platform is built for it rather than adapted to it, and the console never constructs an explorer URL itself: links come from the backend, so the frontend has no opinion about which explorer this chain uses.",
        },
        {
          kind: "heading",
          id: "is-there-an-sdk",
          content: "Is there an SDK?",
        },
        {
          kind: "text",
          content:
            "No. Every route is a documented `GET` or `POST` returning JSON, which `curl` can drive. There is no package to install and nothing to keep in sync with the API.",
        },
      ],
    },
    {
      slug: "usage",
      title: "Usage and billing",
      description: "Quotas, what counts against them, and what happens when you run out.",
      blocks: [
        {
          kind: "heading",
          id: "what-counts",
          content: "What counts against my quota?",
        },
        {
          kind: "text",
          content:
            "Analyses. Reading stored results, listing executions, checking health, browsing agents, and previewing a plan are all free. A scheduled watch check **does** count — it is an analysis like any other.",
        },
        {
          kind: "heading",
          id: "does-a-cached-run-count",
          content: "Does a cached result count?",
        },
        {
          kind: "text",
          content:
            "No. Re-running the same subject inside ten minutes returns the stored result without spending a unit.",
        },
        {
          kind: "heading",
          id: "ran-out",
          content: "I ran out of quota. Now what?",
        },
        {
          kind: "text",
          content:
            "The allowance resets at 00:00 UTC, and the `quota_exhausted` error carries `resets_at`. Creating a second key to get around it works up to three keys per address per day — beyond that, self-serve signup would just be a slower way to get unlimited quota, which is why the limit exists.",
        },
        {
          kind: "heading",
          id: "lost-my-key",
          content: "I lost my key.",
        },
        {
          kind: "text",
          content:
            "It cannot be recovered — only a hash is stored. Create another. Note that history, watches, and change detection are scoped per key, so a new key starts empty; a subject you analysed under the old key will not diff against the new one.",
        },
        {
          kind: "heading",
          id: "why-metered",
          content: "Why is it metered at all?",
        },
        {
          kind: "text",
          content:
            "Each analysis costs real inference credit — roughly a cent. Metering is a money decision rather than a capacity one, which is also why spend is capped in the database rather than in memory: it has to hold across restarts.",
        },
      ],
    },
    {
      slug: "results",
      title: "Reading results",
      description: "Unknowns, missing summaries, empty change reports, and other things that look like bugs.",
      blocks: [
        {
          kind: "heading",
          id: "lots-of-unknowns",
          content: "Why does my result have so many unknowns?",
        },
        {
          kind: "text",
          content:
            "Because those checks could not run, and the platform will not pretend otherwise. The common causes are an unverified contract with no published source, a provider without a credential on this deployment, and an upstream that was down. Each `unknown` carries a `reason` naming which.",
        },
        {
          kind: "heading",
          id: "no-summary",
          content: "There is no summary.",
        },
        {
          kind: "text",
          content:
            "Check `summary_status`. `not_configured` means the deployment has no summary credential; `skipped` means it was deliberately not requested — scheduled watch runs skip it, because the diff is the product and hourly prose about an unmoved token is pure cost. An absent summary always says which.",
        },
        {
          kind: "heading",
          id: "no-changes-section",
          content: "There is no change report.",
        },
        {
          kind: "text",
          content:
            "There was nothing to compare against — either it is the first run for that subject under your key, or the previous one is older than the 30-day lookback. It reports nothing rather than \"no changes\", which would be a claim that the subject was checked and found unmoved.",
        },
        {
          kind: "heading",
          id: "score-null",
          content: "The score is null, not zero.",
        },
        {
          kind: "text",
          content:
            "Nothing could be established. Zero would read as the worst possible result, and a hundred as the best; neither is true when nothing is known. `level` is `unscored` in this case.",
        },
        {
          kind: "heading",
          id: "wallet-missing-tokens",
          content: "My wallet analysis skipped some tokens.",
        },
        {
          kind: "text",
          content:
            "Screening is capped at eight positions, because each costs four explorer reads and an unbounded wallet would be rate-limited into returning nothing. The ones past the cap are listed in `skipped[]` by address and symbol rather than dropped silently.",
        },
        {
          kind: "heading",
          id: "different-answer",
          content: "I ran the same analysis twice and got different findings.",
        },
        {
          kind: "text",
          content:
            "Most likely a source that was unavailable the first time answered the second, turning an `unknown` into a real result — or the reverse. The change report names exactly which findings moved and in which direction.",
        },
      ],
    },
    {
      slug: "operating",
      title: "Running it yourself",
      description: "Self-hosting, credentials, and what works with none of them.",
      blocks: [
        {
          kind: "heading",
          id: "credentials-needed",
          content: "How many credentials do I need?",
        },
        {
          kind: "text",
          content:
            "None. The application starts with zero, `/api/health` names every variable that would enable something, and the router routes around whatever is absent. A website audit runs entirely on sources that need no account.",
        },
        {
          kind: "heading",
          id: "adding-a-key",
          content: "What does adding a key change?",
        },
        {
          kind: "text",
          content:
            "It brings a provider into rotation, and nothing else. There is no code path a credential unlocks — adding one and restarting is the whole enablement story.",
        },
        {
          kind: "heading",
          id: "database",
          content: "Which database?",
        },
        {
          kind: "text",
          content:
            "SQLite by default, so history survives a restart on a machine with nothing installed. PostgreSQL in production is a `DATABASE_URL` change with no code to touch. `/api/health` reports which one is actually in use, and whether it is ephemeral — a container writing to a SQLite file forgets everything on the next deploy.",
        },
        {
          kind: "heading",
          id: "monitoring-off",
          content: "Why is monitoring off by default?",
        },
        {
          kind: "text",
          content:
            "A monitor that started itself would begin spending every existing key's quota the moment a new version deployed. That is not a decision a version bump should make on an operator's behalf.",
        },
        {
          kind: "heading",
          id: "replicas",
          content: "Can I run more than one replica?",
        },
        {
          kind: "text",
          content:
            "Yes, with one caveat: the monitor loop has no cross-process lock, so two replicas with monitoring enabled run every scheduled check twice and bill the owner twice. The rate limiter is also per-process — it protects one instance from a burst rather than enforcing a global limit. Spend is capped in the database, which is the part that actually guards money.",
        },
      ],
    },
  ],
};
