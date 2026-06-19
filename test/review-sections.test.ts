import { describe, it, expect } from "vitest";
import { assembleReview } from "../src/assemble-review.js";
import type { Block } from "../src/blocks.js";

describe("review sections", () => {
  it("renders a diagram in the zoomable card and an api block", async () => {
    const blocks: Block[] = [
      { type: "diagram", id: "d", title: "Flow", kind: "flowchart", d2: "a -> b" },
      { type: "api", id: "api", title: "tRPC", procedures: [
        { name: "x.do", auth: "protected", kind: "query", input: "z.object({})", change: "added" }] },
    ];
    const html = await assembleReview(blocks, { title: "T", source: "s" });
    expect(html).toContain('class="diagram-box"');
    expect(html).toContain("diagram-enlarge");
    expect(html).toContain('class="diagram-svg"');   // injected so zoom binds
    expect(html).toContain("<svg");
    expect(html).toContain("x.do");
    expect(html).toContain('class="api-surface"');
  }, 30_000);
});
