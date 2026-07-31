import type { Block, DocCategory } from "@/config/docs/types";
import { PHASE_BLURB, PHASE_ORDER, itemsInPhase } from "@/config/roadmap";

/**
 * The roadmap page, generated from `config/roadmap.ts`.
 *
 * Generated rather than written, so the phase shown here and the phase on a
 * "coming soon" card in the developer platform cannot disagree. They did, when
 * the two were maintained separately.
 */
const blocks: Block[] = [
  {
    kind: "text",
    content:
      "What exists, what is being built, and what follows. Anything below the **Shipped** section does not exist yet, and is labelled so you never have to guess which is which.",
  },
  {
    kind: "callout",
    tone: "note",
    title: "No dates",
    content:
      "A date given at this stage is a promise made with the least information anyone will ever have about the work. Phases say order, which is the part that is actually known.",
  },
  ...PHASE_ORDER.flatMap((phase): Block[] => {
    const items = itemsInPhase(phase);
    if (items.length === 0) return [];

    return [
      { kind: "heading", id: phase.toLowerCase(), content: phase },
      { kind: "text", content: PHASE_BLURB[phase] },
      {
        kind: "definitions",
        items: items.map((item) => ({
          term: phase === "Shipped" ? item.title : `${item.title} — Coming soon`,
          description: `${item.description} **Why it matters:** ${item.why}`,
        })),
      },
    ];
  }),
  { kind: "heading", id: "how-to-read-this", content: "How to read this" },
  {
    kind: "text",
    content:
      "A feature moves down this page, never up. Something in **Future** is wanted rather than committed, and listing it is a statement of direction — not a queue position. If something you need is missing, the roadmap is the wrong place to find that out; say so instead.",
  },
];

export const roadmapDocs: DocCategory = {
  id: "roadmap",
  title: "Roadmap",
  description: "What is built, what is next, and what is only an intention.",
  pages: [
    {
      slug: "",
      title: "Roadmap",
      description:
        "Every planned Molthood capability, grouped by how close it is, with nothing unbuilt presented as if it exists.",
      blocks,
    },
  ],
};
