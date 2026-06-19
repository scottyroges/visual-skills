import { describe, it, expect } from "vitest";
import { lintCompleteness } from "../src/lint-completeness.js";
import type { Block, DiffBlock, OverviewBlock } from "../src/blocks.js";

// A non-trivial diff: more changed lines than the trivial floor, no description.
function bigDiff(id: string, path: string, description?: string): DiffBlock {
  return {
    type: "diff", id, title: path, path, description,
    hunks: [{ header: "@@ -1,8 +1,8 @@", lines: [
      "-const a = 1", "+const a = 2", "-const b = 3", "+const b = 4",
      "-const c = 5", "+const c = 6", " unchanged",
    ] }],
  };
}

const fullOverview: OverviewBlock = {
  type: "overview", id: "overview", headline: "Do the thing",
  points: [{ text: "a point" }],
  facets: { what: "what", why: "why", size: "1 file" },
  risk: { level: "low", note: "additive" },
};

describe("lintCompleteness", () => {
  it("returns no warnings for a recap with no diffs (nothing to enforce)", () => {
    const blocks: Block[] = [{ type: "file-tree", id: "ft", title: "Files", files: [] }];
    expect(lintCompleteness(blocks)).toEqual([]);
  });

  it("warns when there is no overview block", () => {
    const blocks: Block[] = [bigDiff("d1", "src/x.ts", "**ok.**\n\n- did a thing")];
    const w = lintCompleteness(blocks);
    expect(w.some((m) => /overview/i.test(m))).toBe(true);
  });

  it("warns when overview TL;DR facets are incomplete", () => {
    const ov: OverviewBlock = { ...fullOverview, facets: { what: "what" } };
    const blocks: Block[] = [ov, bigDiff("d1", "src/x.ts", "**ok.**\n\n- did a thing")];
    const w = lintCompleteness(blocks);
    expect(w.some((m) => /why/.test(m) && /size/.test(m))).toBe(true);
  });

  it("warns when overview has no risk", () => {
    const ov: OverviewBlock = { ...fullOverview, risk: undefined };
    const blocks: Block[] = [ov, bigDiff("d1", "src/x.ts", "**ok.**\n\n- did a thing")];
    const w = lintCompleteness(blocks);
    expect(w.some((m) => /risk/i.test(m))).toBe(true);
  });

  it("warns when non-trivial diffs have no description", () => {
    const blocks: Block[] = [fullOverview, bigDiff("d1", "src/x.ts"), bigDiff("d2", "src/y.ts")];
    const w = lintCompleteness(blocks);
    const hit = w.find((m) => /annotat|description/i.test(m));
    expect(hit).toBeTruthy();
    expect(hit).toContain("2");
  });

  it("does not flag a trivial (1-2 line) diff for a missing description", () => {
    const tiny: DiffBlock = {
      type: "diff", id: "d1", title: "x", path: "src/x.ts",
      hunks: [{ header: "@@ -1 +1 @@", lines: ["-const a = 1", "+const a = 2"] }],
    };
    const blocks: Block[] = [fullOverview, tiny];
    expect(lintCompleteness(blocks)).toEqual([]);
  });

  it("warns when many diffs sit ungrouped at the top level", () => {
    const blocks: Block[] = [
      fullOverview,
      bigDiff("d1", "src/a.ts", "**a.**\n\n- x"),
      bigDiff("d2", "src/b.ts", "**b.**\n\n- x"),
      bigDiff("d3", "src/c.ts", "**c.**\n\n- x"),
    ];
    const w = lintCompleteness(blocks);
    expect(w.some((m) => /group/i.test(m))).toBe(true);
  });

  it("does not warn about grouping when diffs are inside groups", () => {
    const blocks: Block[] = [
      fullOverview,
      { type: "group", id: "g", title: "Core", description: "the core", blocks: [
        bigDiff("d1", "src/a.ts", "**a.**\n\n- x"),
        bigDiff("d2", "src/b.ts", "**b.**\n\n- x"),
        bigDiff("d3", "src/c.ts", "**c.**\n\n- x"),
      ] },
    ];
    expect(lintCompleteness(blocks)).toEqual([]);
  });

  it("counts unannotated diffs inside groups too", () => {
    const blocks: Block[] = [
      fullOverview,
      { type: "group", id: "g", title: "Core", description: "the core", blocks: [
        bigDiff("d1", "src/a.ts"),
      ] },
    ];
    const w = lintCompleteness(blocks);
    expect(w.some((m) => /annotat|description/i.test(m))).toBe(true);
  });

  it("is clean for a fully-enriched small recap (one annotated diff, no group needed)", () => {
    const blocks: Block[] = [fullOverview, bigDiff("d1", "src/x.ts", "**Fix.**\n\n- sorts the list")];
    expect(lintCompleteness(blocks)).toEqual([]);
  });
});
