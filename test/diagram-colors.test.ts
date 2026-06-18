import { describe, it, expect } from "vitest";
import { PALETTE, D2_CLASS_PRELUDE, MERMAID_CLASSDEFS } from "../src/diagram-colors.js";
import { renderDiagram } from "../src/render-diagram.js";
import type { DiagramBlock } from "../src/blocks.js";

describe("diagram colors", () => {
  it("PALETTE has the six semantic roles", () => {
    expect(Object.keys(PALETTE).sort()).toEqual(
      ["actor", "added", "changed", "external", "removed", "store"],
    );
  });

  it("both generated strings reference every role with the PALETTE hex", () => {
    for (const [role, { fill }] of Object.entries(PALETTE)) {
      expect(D2_CLASS_PRELUDE).toContain(`${role}: {`);
      expect(D2_CLASS_PRELUDE).toContain(fill);
      expect(MERMAID_CLASSDEFS).toContain(`classDef ${role}`);
      expect(MERMAID_CLASSDEFS).toContain(fill);
    }
  });

  it("the injected prelude makes a `class: changed` diagram render the role's fill", async () => {
    const block: DiagramBlock = {
      type: "diagram", id: "c", title: "c", kind: "flowchart", d2: "x: { class: changed }",
    };
    const out = await renderDiagram(block, { excalidraw: false });
    expect(out.svg).toMatch(/<svg/);
    expect(out.svg.toLowerCase()).toContain("ffd43b"); // PALETTE.changed.fill
  }, 30_000);
});
