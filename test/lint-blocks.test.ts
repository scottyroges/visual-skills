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

describe("lintBlocks traversal completeness", () => {
  // The example collector must reach everywhere a block can sit — same paths as the diagram
  // collector — or an example that RENDERS gets no judgment lints at all.
  it("lints an example nested in a tabs block (synthetic source + dead reveal)", () => {
    const blocks: Block[] = [
      { type: "tabs", id: "t", title: "Cases", tabs: [
        { label: "one", block: {
          type: "example", id: "ex", title: "E", source: "synthetic fixture", lesson: "l",
          mode: "reveal", stages: [{ label: "in", body: "x" }],
        } },
      ] },
    ];
    const w = lintBlocks(blocks);
    expect(w.some((m) => m.includes("synthetic source"))).toBe(true);
    expect(w.some((m) => m.includes("no stage has reveal:true"))).toBe(true);
  });

  it("lints an example hanging off diff.diagram and overview.diagram", () => {
    const ex = (id: string) => ({
      type: "example", id, title: "E", source: "synthetic fixture", lesson: "l",
      stages: [{ label: "in", body: "x" }],
    });
    const blocks = [
      { type: "diff", id: "d", title: "x", path: "src/x.ts", hunks: [],
        diagram: { type: "tabs", id: "t1", tabs: [{ label: "a", block: ex("ex-diff") }] } },
      { type: "overview", id: "ov", headline: "h", points: [],
        diagram: { type: "tabs", id: "t2", tabs: [{ label: "a", block: ex("ex-ov") }] } },
    ] as unknown as Block[];
    const w = lintBlocks(blocks);
    expect(w.filter((m) => m.includes("synthetic source"))).toHaveLength(2);
    expect(w.some((m) => m.includes('"ex-diff"'))).toBe(true);
    expect(w.some((m) => m.includes('"ex-ov"'))).toBe(true);
  });
});
