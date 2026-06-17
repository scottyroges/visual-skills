import { describe, it, expect } from "vitest";
import { renderDiff } from "../src/renderers/diff.js";
import type { DiffBlock } from "../src/blocks.js";

describe("renderDiff", () => {
  it("renders hunks with per-line add/del/context classes and escapes HTML", () => {
    const block: DiffBlock = {
      type: "diff", id: "d", title: "league.ts", path: "src/server/routers/league.ts",
      hunks: [{
        header: "@@ -56,6 +56,12 @@",
        lines: [
          "   createCheckoutSession(...)",
          "+  captureOrder: protectedProcedure",
          "-  old<line>",
        ],
        annotation: "Adds the server-side capture mutation.",
      }],
    };
    const html = renderDiff(block);
    expect(html).toContain('class="vs-block vs-diff"');
    expect(html).toContain('class="vs-line vs-add"');
    expect(html).toContain('class="vs-line vs-del"');
    expect(html).toContain('class="vs-line vs-ctx"');
    expect(html).toContain("&lt;line&gt;");
    expect(html).toContain("Adds the server-side capture mutation.");
  });
});
