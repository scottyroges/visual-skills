import { describe, it, expect } from "vitest";
import { renderDiffBody } from "../src/review/diff.js";
import type { DiffBlock } from "../src/blocks.js";

const d: DiffBlock = {
  type: "diff", id: "diff-0", title: "x.ts", path: "src/x.ts",
  hunks: [{ header: "@@ -10,3 +10,4 @@ ctx", lines: [" a", "+b", "-c", " d"] }],
};

describe("renderDiffBody", () => {
  it("renders old/new line numbers, +/- gutters, and the full diff (no truncation)", () => {
    const html = renderDiffBody(d);
    expect(html).toContain('class="diff-pre"');
    expect(html).toContain('class="dl dl-add"');
    expect(html).toContain('class="dl dl-del"');
    expect(html).toContain('class="dl dl-ctx"');
    expect(html).toContain('class="dl dl-hunk"');
    expect(html).toMatch(/<span class="dn">10<\/span><span class="dn">10<\/span>/);
    expect(html).toMatch(/<span class="dn"><\/span><span class="dn">11<\/span>/);
    expect(html).not.toContain("more lines");
  });
});
