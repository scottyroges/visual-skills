import { describe, it, expect } from "vitest";
import { assemble } from "../src/assemble.js";
import type { Block } from "../src/blocks.js";

describe("assemble", () => {
  it("produces one self-contained HTML doc with inlined CSS, header, and rendered blocks", async () => {
    const blocks: Block[] = [
      { type: "prose", id: "p", markdown: "Intro **text**." },
      { type: "diagram", id: "flow", title: "Flow", kind: "flowchart", d2: "a -> b" },
    ];
    const html = await assemble(blocks, {
      title: "Test Plan", source: "spec.md", status: { level: "green", text: "ready" },
    });
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain("<style>");
    expect(html).not.toContain("<link");
    expect(html).toContain("Test Plan");
    expect(html).toContain("spec.md");
    expect(html).toContain('class="vs-status green"');
    expect(html).toContain("<strong>text</strong>");
    expect(html).toContain("<svg");
    expect(html).not.toContain("<script");
  });
});
