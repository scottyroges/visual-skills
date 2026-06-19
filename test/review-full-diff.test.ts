import { describe, it, expect } from "vitest";
import { gatherRecap } from "../src/gather-recap.js";
import { assembleReview } from "../src/assemble-review.js";

describe("review full-diff capture", () => {
  it("renders the complete diff for a real commit (no per-file truncation)", async () => {
    const { blocks } = await gatherRecap({ kind: "commit", ref: "HEAD" }, ".");
    const html = await assembleReview(blocks, { title: "T", source: "x" });
    expect(html).not.toContain("more lines");
    expect(html).not.toMatch(/view the (full )?diff in the PR/i);
    // every gathered +/- line is rendered (no truncation): rendered add/del rows == gathered changed lines
    let changed = 0;
    const walk = (bs: any[]) => {
      for (const b of bs) {
        if (b && b.type === "diff") changed += b.hunks.flatMap((h: any) => h.lines).filter((l: string) => l[0] === "+" || l[0] === "-").length;
        if (b && Array.isArray(b.blocks)) walk(b.blocks);
      }
    };
    walk(blocks);
    const rendered = (html.match(/class="dl dl-(add|del)"/g) || []).length;
    expect(rendered).toBe(changed);
    expect(changed).toBeGreaterThan(0);   // sanity: the HEAD commit actually changed code
  }, 30_000);
});
