import { describe, it, expect } from "vitest";
import { lintBlocks } from "../src/lint-blocks.js";
import type { Block } from "../src/blocks.js";

const wall =
  "This is a long single paragraph description that runs on and on without any bullet " +
  "points or paragraph breaks, exactly the kind of wall of text the lint is meant to catch " +
  "because it exceeds three hundred characters and offers the reader no scannable structure " +
  "whatsoever, just sentence after sentence after sentence.";

const bulleted =
  "**Takeaway.**\n\n- first point that is reasonably long\n- second point\n- third point " +
  "with some `code` in it to push the total length comfortably over three hundred characters " +
  "so the only thing keeping it un-flagged is the presence of bullet structure, not brevity.";

describe("lintBlocks", () => {
  it("warns when a group has no description", () => {
    const blocks: Block[] = [
      { type: "group", id: "g1", title: "G", blocks: [] },
    ];
    const w = lintBlocks(blocks);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('group "g1"');
    expect(w[0]).toMatch(/no description/i);
  });

  it("does not warn for a group that has a description", () => {
    const blocks: Block[] = [
      { type: "group", id: "g1", title: "G", description: "Covers the core change.", blocks: [] },
    ];
    expect(lintBlocks(blocks)).toEqual([]);
  });

  it("warns when a diff description is a long single paragraph", () => {
    const blocks: Block[] = [
      { type: "diff", id: "d1", title: "x", path: "src/x.ts", description: wall, hunks: [] },
    ];
    const w = lintBlocks(blocks);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('diff "d1"');
    expect(w[0]).toContain("src/x.ts");
    expect(w[0]).toMatch(/single paragraph|bullet/i);
  });

  it("does not warn for a long but bulleted diff description", () => {
    const blocks: Block[] = [
      { type: "diff", id: "d1", title: "x", path: "src/x.ts", description: bulleted, hunks: [] },
    ];
    expect(lintBlocks(blocks)).toEqual([]);
  });

  it("does not warn for a short diff description or an omitted one", () => {
    const blocks: Block[] = [
      { type: "diff", id: "d1", title: "x", path: "src/x.ts", description: "Renames a field.", hunks: [] },
      { type: "diff", id: "d2", title: "y", path: "src/y.ts", hunks: [] },
    ];
    expect(lintBlocks(blocks)).toEqual([]);
  });

  it("recurses into groups to lint the diffs inside them", () => {
    const blocks: Block[] = [
      { type: "group", id: "g1", title: "G", description: "ok", blocks: [
        { type: "diff", id: "d1", title: "x", path: "src/x.ts", description: wall, hunks: [] },
      ] },
    ];
    const w = lintBlocks(blocks);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('diff "d1"');
  });
});
