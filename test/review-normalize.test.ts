import { describe, it, expect } from "vitest";
import { groupLooseDiffs } from "../src/review/normalize.js";
import type { Block } from "../src/blocks.js";

describe("groupLooseDiffs", () => {
  it("wraps a run of top-level diff blocks into one synthetic group, leaving other blocks in place", () => {
    const blocks: Block[] = [
      { type: "prose", id: "summary", markdown: "x" },
      { type: "file-tree", id: "files", title: "Files", files: [] },
      { type: "diff", id: "d0", title: "a", path: "a", hunks: [] },
      { type: "diff", id: "d1", title: "b", path: "b", hunks: [] },
    ];
    const out = groupLooseDiffs(blocks);
    expect(out.filter((b) => b.type === "diff")).toHaveLength(0);    // no loose diffs remain
    const groups = out.filter((b) => b.type === "group");
    expect(groups).toHaveLength(1);
    expect((groups[0] as any).blocks.map((b: any) => b.id)).toEqual(["d0", "d1"]);
    expect(out[0].type).toBe("prose");                              // non-diff blocks untouched & ordered
    expect(out[1].type).toBe("file-tree");
  });

  it("leaves existing group blocks alone and gives synthetic groups unique ids", () => {
    const blocks: Block[] = [
      { type: "diff", id: "d0", title: "a", path: "a", hunks: [] },
      { type: "prose", id: "p", markdown: "x" },
      { type: "group", id: "grp", title: "Real", blocks: [
        { type: "diff", id: "d1", title: "b", path: "b", hunks: [] }] },
      { type: "diff", id: "d2", title: "c", path: "c", hunks: [] },
    ];
    const out = groupLooseDiffs(blocks);
    const groupIds = out.filter((b) => b.type === "group").map((b) => b.id);
    expect(new Set(groupIds).size).toBe(groupIds.length);          // unique
    expect(groupIds).toContain("grp");                             // real group preserved
    expect(out.filter((b) => b.type === "diff")).toHaveLength(0);  // both loose diffs wrapped
  });
});
