import { describe, it, expect } from "vitest";
import { assembleReview } from "../src/assemble-review.js";
import type { Block } from "../src/blocks.js";

// One minimal sample per Block union member. The `Record<Block["type"], Block>` type makes this
// EXHAUSTIVE: if a new block type is added to the union, this file fails to compile until a sample
// is added here — which in turn forces assembleReview to grow a renderer for it (the guard that
// would have caught top-level `tabs` being silently dropped).
const SAMPLES: Record<Block["type"], Block> = {
  diagram: { type: "diagram", id: "s-diagram", title: "D", kind: "flowchart", d2: "a -> b" },
  schema: { type: "schema", id: "s-schema", title: "S", kind: "erd", d2: "a -> b" },
  api: { type: "api", id: "s-api", title: "API", procedures: [
    { name: "x.do", auth: "protected", kind: "query", input: "z.object({})", change: "added" }] },
  "file-tree": { type: "file-tree", id: "s-files", title: "Files",
    files: [{ path: "src/x.ts", status: "M", added: 1, deleted: 0 }] },
  diff: { type: "diff", id: "s-diff", title: "x.ts", path: "src/x.ts",
    hunks: [{ header: "@@ -1 +1 @@", lines: ["+a"] }] },
  prose: { type: "prose", id: "s-prose", title: "P", markdown: "Body." },
  "annotated-code": { type: "annotated-code", id: "s-annotated", title: "A", lang: "ts",
    code: "const x = 1;", annotations: [] },
  questions: { type: "questions", id: "s-questions", title: "Q",
    questions: [{ question: "Why?", recommendedDefault: "Because." }] },
  group: { type: "group", id: "s-group", title: "G", description: "A group.",
    blocks: [{ type: "diff", id: "s-group-diff", title: "y.ts", path: "y.ts",
      hunks: [{ header: "@@ -1 +1 @@", lines: ["+b"] }] }] },
  tabs: { type: "tabs", id: "s-tabs", title: "T", tabs: [
    { label: "One", block: { type: "diagram", id: "s-tab-diagram", title: "TD", kind: "flowchart", d2: "c -> d" } }] },
  overview: { type: "overview", id: "s-overview", headline: "H", points: [{ text: "a point" }] },
};

describe("assembleReview block coverage", () => {
  it("renders every Block union member without hitting the 'no renderer' fallback", async () => {
    const warnings: string[] = [];
    const blocks = Object.values(SAMPLES);
    const html = await assembleReview(blocks, { title: "T", source: "s", onWarn: (m) => warnings.push(m) });

    const unrendered = warnings.filter((w) => w.includes("no renderer for block type"));
    expect(unrendered).toEqual([]);                 // every block type has a renderer
    expect(html).toMatch(/^<!doctype html>/i);
  }, 60_000);
});
