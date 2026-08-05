import { describe, it, expect } from "vitest";
import { renderExample } from "../src/renderers/example.js";
import type { ExampleBlock } from "../src/blocks.js";

const base = (over: Partial<ExampleBlock> = {}): ExampleBlock => ({
  type: "example", id: "ex-roll", title: "One window through the roll-call",
  source: "test/fixtures/burn-unit-wanderer.json, msgs 4–7", lesson: "per-sentence means holes are visible",
  stages: [
    { label: "Input — window 2", kind: "input", body: "four sentences" },
    { label: "Verdicts", kind: "step", body: "one per sentence" },
    { label: "Boundaries", kind: "output", body: "two survive" },
  ],
  ...over,
});

describe("renderExample", () => {
  it("renders a static rail: tinted stages, arrows between, provenance line, lesson band", async () => {
    const html = await renderExample(base(), { ownHeader: false });
    expect(html).toContain('data-kind="input"');
    expect(html).toContain('data-kind="output"');
    expect((html.match(/class="vs-ex-arrow"/g) ?? []).length).toBe(2);   // n-1 arrows
    expect(html).toContain("vs-ex-src");
    expect(html).toContain("burn-unit-wanderer.json");
    expect(html).toContain("vs-ex-lesson");
    expect(html).not.toContain("vs-ex-head");                            // ownHeader:false → no own title
  });

  it("ownHeader:true emits the title header; escapes author text", async () => {
    const html = await renderExample(base({ title: "<b>x</b>", badge: "worked" }), { ownHeader: true });
    expect(html).toContain("vs-ex-head");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<b>x</b>");
  });

  it("renders stage bodies as markdown (fences become code blocks)", async () => {
    const html = await renderExample(base({
      stages: [{ label: "in", kind: "input", body: "```json\n{\"a\":1}\n```" }],
    }), { ownHeader: false });
    expect(html).toMatch(/<pre|<code/);
  });

  it("contrast: shared stage full-width, a/b columns with headers, empty side gets a visible marker", async () => {
    const html = await renderExample(base({
      variant: "contrast", columns: ["Old", "New"],
      stages: [
        { label: "the paragraph", kind: "input", body: "shared" },
        { label: "merged", kind: "output", body: "one segment", side: "a" },
      ],
    }), { ownHeader: false });
    expect(html).toContain("vs-ex-cols");
    expect(html).toContain(">Old<");
    expect(html).toContain(">New<");
    expect(html).toContain("empty column");                              // side b missing → ⚠ marker
  });

  it("reveal: flagged stage collapses into <details>", async () => {
    const html = await renderExample(base({
      mode: "reveal",
      stages: [
        { label: "in", kind: "input", body: "x" },
        { label: "out", kind: "output", body: "y", reveal: true },
      ],
    }), { ownHeader: false });
    expect(html).toContain('<details class="vs-ex-reveal"');
    expect(html).toContain("Show:");
  });

  it("step: fieldset + sr-only legend, aria-labels on inputs, N+1 radios, All labeled", async () => {
    const html = await renderExample(base({ mode: "step" }), { ownHeader: false });
    expect(html).toContain("<fieldset");
    expect(html).toContain("Walkthrough stages");
    expect((html.match(/class="vs-ex-radio"/g) ?? []).length).toBe(4);   // 3 stages + All
    expect(html).toContain('aria-label="Stage 1 of 3: Input — window 2"');
    expect(html).toContain('aria-label="Show all stages"');
    expect(html).toContain(">All<");
  });

  it("malformed JSON: missing source/lesson/stages render visible markers, problems reach onWarn", async () => {
    const warns: string[] = [];
    const html = await renderExample(
      { type: "example", id: "bad", title: "B" } as ExampleBlock,
      { ownHeader: true, onWarn: (m) => warns.push(m) },
    );
    expect(html).toContain("no source given");
    expect(html).toContain("no lesson written");
    expect(html).toContain("no stages");
    expect(warns.length).toBeGreaterThanOrEqual(3);
  });
});
