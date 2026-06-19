import { describe, it, expect } from "vitest";
import { renderDiagram } from "../src/render-diagram.js";
import type { DiagramBlock } from "../src/blocks.js";

describe("clean d2", () => {
  it("renders without the hand-drawn sketch filter", async () => {
    const block: DiagramBlock = { type: "diagram", id: "d", title: "D", kind: "flowchart", d2: "a -> b" };
    const out = await renderDiagram(block, { excalidraw: false });
    expect(out.svg).toMatch(/<svg/);
    // d2 --sketch injects a roughjs turbulence filter; clean mode must not contain it
    expect(out.svg).not.toMatch(/feTurbulence|sketch/i);
  }, 30_000);
});
