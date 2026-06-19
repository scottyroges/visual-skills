import { describe, it, expect } from "vitest";
import { renderWalkthrough } from "../src/review/walkthrough.js";
import type { Block } from "../src/blocks.js";

const blocks: Block[] = [
  { type: "group", id: "grp-core", title: "Core change", description: "The heart.",
    blocks: [
      { type: "diff", id: "diff-0", title: "x.ts", path: "src/x.ts",
        description: "Adds a thing.", hunks: [{ header: "@@ -1 +1 @@", lines: ["+a", "-b"] }] },
      { type: "diff", id: "diff-1", title: "y.ts", path: "src/y.ts",
        hunks: [{ header: "@@ -1 +1 @@", lines: ["+c"] }] },
    ] },
  { type: "group", id: "grp-tests", title: "Tests", blocks: [
      { type: "diff", id: "diff-2", title: "t.ts", path: "src/t.test.ts", hunks: [{ header: "@@", lines: ["+t"] }] },
  ] },
];

describe("renderWalkthrough", () => {
  it("numbers chapters (1/2) and subsections (1a/1b), renders group desc + a collapsed file-diff", async () => {
    const html = await renderWalkthrough(blocks);
    expect(html).toContain('id="grp-core"');
    expect(html).toContain('class="chapter-no"');
    expect(html).toContain(">1<");
    expect(html).toContain(">1a<");
    expect(html).toContain(">1b<");
    expect(html).toContain(">2<");
    expect(html).toContain("The heart.");
    expect(html).toContain('class="file-diff"');
    expect(html).toContain("Adds a thing.");
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);   // diffs collapsed
  });
});
