import { describe, it, expect } from "vitest";
import { promoteMermaidFences } from "../src/promote-mermaid.js";
import type { Block } from "../src/blocks.js";

describe("promoteMermaidFences", () => {
  it("splits a convertible mermaid fence into prose + flowchart diagram + prose, in order", () => {
    const blocks: Block[] = [
      {
        type: "prose", id: "p",
        markdown: "Before text.\n\n```mermaid\ngraph TD\nA-->B\n```\n\nAfter text.",
      },
    ];
    const out = promoteMermaidFences(blocks);
    expect(out.map((b) => b.type)).toEqual(["prose", "diagram", "prose"]);
    const diagram = out[1] as Extract<Block, { type: "diagram" }>;
    expect(diagram.kind).toBe("flowchart");
    expect(diagram.mermaid).toContain("graph TD");
    expect(diagram.d2).toContain('"A" -> "B"');
    expect(out[0]).toMatchObject({ type: "prose" });
    expect((out[0] as Extract<Block, { type: "prose" }>).markdown).toContain("Before text.");
    expect((out[2] as Extract<Block, { type: "prose" }>).markdown).toContain("After text.");
  });

  it("leaves an unconvertible fence inline (no diagram block)", () => {
    const blocks: Block[] = [
      { type: "prose", id: "p", markdown: "```mermaid\nsequenceDiagram\nA->>B: hi\n```" },
    ];
    const out = promoteMermaidFences(blocks);
    expect(out.every((b) => b.type !== "diagram")).toBe(true);
    expect((out[0] as Extract<Block, { type: "prose" }>).markdown).toContain("sequenceDiagram");
  });

  it("passes non-prose blocks through unchanged and keeps ids unique", () => {
    const blocks: Block[] = [
      { type: "questions", id: "q", title: "Q", questions: [{ question: "x", recommendedDefault: "y" }] },
      { type: "prose", id: "p", markdown: "```mermaid\ngraph LR\nA-->B\n```\n\ntail" },
    ];
    const out = promoteMermaidFences(blocks);
    expect(out[0]).toEqual(blocks[0]);
    const ids = out.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps an interleaved unconvertible fence inline while promoting the convertible one", () => {
    const md =
      "Intro.\n\n```mermaid\nsequenceDiagram\nA->>B: hi\n```\n\n" +
      "Then:\n\n```mermaid\ngraph TD\nA-->B\n```\n\nEnd.";
    const out = promoteMermaidFences([{ type: "prose", id: "p", markdown: md }]);
    // exactly one diagram (the convertible graph), and the sequenceDiagram stays in prose
    const diagrams = out.filter((b) => b.type === "diagram");
    expect(diagrams).toHaveLength(1);
    expect((diagrams[0] as Extract<Block, { type: "diagram" }>).mermaid).toContain("graph TD");
    const proseText = out
      .filter((b) => b.type === "prose")
      .map((b) => (b as Extract<Block, { type: "prose" }>).markdown)
      .join("\n");
    expect(proseText).toContain("sequenceDiagram"); // unconvertible fence left inline
    expect(proseText).toContain("Intro.");
    expect(proseText).toContain("End.");
  });
});
