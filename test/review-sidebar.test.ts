import { describe, it, expect } from "vitest";
import { renderSidebar, renderProgressRail } from "../src/review/sidebar.js";
import type { Block } from "../src/blocks.js";

const blocks: Block[] = [
  { type: "overview", id: "overview", headline: "H", points: [] },
  { type: "file-tree", id: "files", title: "Files changed",
    files: [{ path: "src/x.ts", status: "M", added: 1, deleted: 0 }] },
  { type: "group", id: "grp-core", title: "Core change", blocks: [
    { type: "diff", id: "diff-0", title: "x.ts", path: "src/x.ts", hunks: [{ header: "@@", lines: ["+a"] }] }] },
  { type: "group", id: "grp-tests", title: "Tests", blocks: [
    { type: "diff", id: "diff-1", title: "t.ts", path: "t.ts", hunks: [{ header: "@@", lines: ["+t"] }] }] },
];

describe("review sidebar", () => {
  it("derives files list + numbered outline with anchors", () => {
    const html = renderSidebar(blocks, new Map([["src/x.ts", "diff-0"]]),
      { title: "T", source: "ppgl · base a → head b" });
    expect(html).toContain('href="#diff-0"');
    expect(html).toContain('href="#grp-core"');
    expect(html).toContain('href="#grp-tests"');
    expect(html).toContain("Core change");
    expect(html).toContain("base a → head b");
  });
  it("progress rail has one anchored step per chapter", () => {
    const rail = renderProgressRail(blocks);
    // count the step anchors (each <a class="progress-step ..."> carries an href hash)
    expect((rail.match(/class="progress-step[ "]/g) || []).length).toBe(2);
    expect(rail).toContain('href="#grp-core"');
  });
});
