import { describe, it, expect } from "vitest";
import { renderTopbar } from "../src/review/topbar.js";
import type { Block } from "../src/blocks.js";

const blocks: Block[] = [
  { type: "overview", id: "overview", headline: "H", points: [], risk: { level: "med" } },
  { type: "file-tree", id: "files", title: "Files changed",
    files: [{ path: "a.ts", status: "M", added: 5, deleted: 2 }, { path: "b.ts", status: "A", added: 3, deleted: 0 }] },
];

describe("renderTopbar", () => {
  it("derives title, risk chip by level, +/- stat, and file count from blocks", () => {
    const html = renderTopbar(blocks, { title: "Weekly standings", source: "ppgl · base a → head b" });
    expect(html).toContain("Weekly standings");
    expect(html).toMatch(/chip-risk risk-med/);
    expect(html).toContain("+8");      // 5+3
    expect(html).toContain("-2");
    expect(html).toContain("2 files");
    expect(html).toContain("ppgl · base a → head b");
  });
});
