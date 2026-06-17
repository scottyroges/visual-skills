import { describe, it, expect } from "vitest";
import { isDiagramBlock, type Block } from "../src/blocks.js";

describe("block model", () => {
  it("recognizes diagram blocks (diagram + schema)", () => {
    const diagram: Block = { type: "diagram", id: "a", title: "A", kind: "flowchart", d2: "x -> y" };
    const schema: Block = { type: "schema", id: "s", title: "S", kind: "erd", d2: "T: {shape: sql_table}" };
    const prose: Block = { type: "prose", id: "p", markdown: "hi" };
    expect(isDiagramBlock(diagram)).toBe(true);
    expect(isDiagramBlock(schema)).toBe(true);
    expect(isDiagramBlock(prose)).toBe(false);
  });
});
