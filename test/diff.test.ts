import { describe, it, expect } from "vitest";
import { renderDiff } from "../src/renderers/diff.js";
import type { DiffBlock } from "../src/blocks.js";

describe("renderDiff", () => {
  it("syntax-highlights a known language and keeps add/del/context classes", async () => {
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
    const html = await renderDiff(block);
    expect(html).toContain('class="vs-block vs-diff"');
    expect(html).toContain('class="vs-line vs-add"');
    expect(html).toContain('class="vs-line vs-del"');
    expect(html).toContain('class="vs-line vs-ctx"');
    expect(html).toContain('class="vs-gutter"');
    expect(html).toContain('style="color:'); // shiki ran
    expect(html).not.toContain("old<line>"); // raw HTML escaped, never literal
    expect(html).toContain("Adds the server-side capture mutation.");
  });

  it("falls back to escaped plain lines for an unknown file type", async () => {
    const block: DiffBlock = {
      type: "diff", id: "d2", title: "data", path: "fixtures/data.unknownext",
      hunks: [{ header: "@@ -1 +1 @@", lines: ["+a < b"] }],
    };
    const html = await renderDiff(block);
    expect(html).toContain('class="vs-line vs-add"');
    expect(html).toContain("a &lt; b");
    expect(html).not.toContain('style="color:'); // no shiki output
  });

  it("renders a markdown description with cross-links above the hunks", async () => {
    const block: DiffBlock = {
      type: "diff", id: "d", title: "x.ts", path: "src/x.ts",
      description: "Switches checkout to PayPal. See [the router](#diff-1).",
      hunks: [{ header: "@@ -1 +1 @@", lines: ["+const a = 1;"] }],
    };
    const html = await renderDiff(block);
    expect(html).toContain('class="vs-diff-desc"');
    expect(html).toContain('href="#diff-1"');
    expect(html.indexOf("vs-diff-desc")).toBeLessThan(html.indexOf("vs-hunk")); // desc before hunks
  });
});
