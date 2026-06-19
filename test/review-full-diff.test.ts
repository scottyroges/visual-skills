import { describe, it, expect } from "vitest";
import { gatherRecap } from "../src/gather-recap.js";
import { assembleReview } from "../src/assemble-review.js";

// A fixed historical commit in THIS repo with substantial code diffs (the first task commit:
// it adds assets/review.css + review-viewer.js + a test, ~1000+ changed lines). Pinned (not HEAD)
// so the test is deterministic and never recaps its own source (which would echo sentinel strings).
const FIXED_COMMIT = "7cc0071a9d6a00edc2cb9cb03e54b6fc12b2ddf2";

describe("review full-diff capture", () => {
  it("renders every gathered +/- line for a real commit (no per-file truncation)", async () => {
    const { blocks } = await gatherRecap({ kind: "commit", ref: FIXED_COMMIT }, ".");
    const html = await assembleReview(blocks, { title: "T", source: "x" });

    // Count gathered changed lines across all diff blocks (recurse groups).
    let changed = 0;
    const walk = (bs: any[]) => {
      for (const b of bs) {
        if (b && b.type === "diff") {
          changed += b.hunks.flatMap((h: any) => h.lines).filter((l: string) => l[0] === "+" || l[0] === "-").length;
        }
        if (b && Array.isArray(b.blocks)) walk(b.blocks);
      }
    };
    walk(blocks);

    // Every gathered +/- line must appear as a rendered diff row — equality proves no truncation.
    const rendered = (html.match(/class="dl dl-(add|del)"/g) || []).length;
    expect(changed).toBeGreaterThan(0);   // sanity: this commit really changed code
    expect(rendered).toBe(changed);
  }, 30_000);
});
