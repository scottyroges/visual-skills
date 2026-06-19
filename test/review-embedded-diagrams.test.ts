import { describe, it, expect } from "vitest";
import { assembleReview } from "../src/assemble-review.js";
import type { Block } from "../src/blocks.js";

describe("embedded diagrams are placed (not dropped)", () => {
  it("renders overview.diagram, diff.diagram, and a top-level tabs block", async () => {
    const blocks: Block[] = [
      { type: "overview", id: "overview", headline: "H", points: [],
        diagram: { type: "diagram", id: "ov-diag", title: "Lead", kind: "flowchart", d2: "a -> b" } },
      { type: "tabs", id: "views", title: "Views", tabs: [
        { label: "One", block: { type: "diagram", id: "tab-diag", title: "T1", kind: "flowchart", d2: "c -> d" } } ] },
      { type: "group", id: "grp", title: "Core", blocks: [
        { type: "diff", id: "diff-0", title: "x.ts", path: "x.ts",
          diagram: { type: "diagram", id: "diff-diag", title: "Inline", kind: "flowchart", d2: "e -> f" },
          hunks: [{ header: "@@ -1 +1 @@", lines: ["+a"] }] } ] },
    ];
    const html = await assembleReview(blocks, { title: "T", source: "s" });
    // all three embedded diagrams produce a zoomable card with the injected diagram-svg class
    expect((html.match(/class="diagram-svg"/g) || []).length).toBe(3);
    // each placed card carries its own diagram-title label
    expect(html).toContain(">Lead</p>");    // overview lead diagram placed
    expect(html).toContain(">T1</p>");      // tabs flattened to a card
    expect(html).toContain(">Inline</p>");  // diff illustration placed
  }, 60_000);
});
