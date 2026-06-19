import { describe, it, expect } from "vitest";
import { lintBlocks } from "../src/lint-blocks.js";
import type { Block } from "../src/blocks.js";

describe("diagram authoring lints", () => {
  it("warns when a diagram applies no semantic color role", () => {
    const w = lintBlocks([{ type: "diagram", id: "d", title: "D", kind: "flowchart", d2: "a -> b", mermaid: "flowchart TD\n a-->b" }]);
    expect(w.some((m) => m.includes("no semantic color"))).toBe(true);
  });
  it("does NOT warn when a diagram applies a role (e.g. changed)", () => {
    const w = lintBlocks([{ type: "diagram", id: "d", title: "D", kind: "flowchart", d2: "a -> b\na.class: changed", mermaid: "flowchart TD\n a-->b\n class a changed;" }]);
    expect(w.some((m) => m.includes("no semantic color"))).toBe(false);
  });
  it("warns when an editable-eligible diagram has no mermaid (lost editability)", () => {
    const w = lintBlocks([{ type: "diagram", id: "d", title: "D", kind: "sequence", d2: "a -> b\na.class: actor" }]);
    expect(w.some((m) => m.includes("no mermaid source"))).toBe(true);
  });
  it("does NOT warn about editability for an erd/schema block", () => {
    const w = lintBlocks([{ type: "schema", id: "s", title: "S", kind: "erd", d2: "a -> b\na.class: changed" }]);
    expect(w.some((m) => m.includes("no mermaid source"))).toBe(false);
  });
  it("warns on diagram overload (more than 6)", () => {
    const many: Block[] = Array.from({ length: 7 }, (_, i) => ({ type: "diagram", id: `d${i}`, title: "D", kind: "flowchart", d2: "a -> b\na.class: changed", mermaid: "flowchart TD\n a-->b\n class a changed;" }));
    const w = lintBlocks(many);
    expect(w.some((m) => /\b7 diagrams\b/.test(m))).toBe(true);
  });
  it("warns on an oversized diagram (>35 connections)", () => {
    const d2 = "x.class: changed\n" + Array.from({ length: 40 }, (_, i) => `n${i} -> m${i}`).join("\n");
    const w = lintBlocks([{ type: "diagram", id: "big", title: "Big", kind: "flowchart", d2, mermaid: "flowchart TD\n a-->b\n class a changed;" }]);
    expect(w.some((m) => m.includes("very large"))).toBe(true);
  });
  it("CALIBRATION: the mechanical baseline diagrams produce no diagram warnings", () => {
    // where-it-fits + api-surface shapes: architecture kind, a role applied, mermaid present, modest size.
    const baseline: Block[] = [
      { type: "diagram", id: "where-it-fits", title: "Where it fits", kind: "architecture",
        d2: Array.from({ length: 17 }, (_, i) => `n${i} -> n${i + 1}`).join("\n") + "\nn0.class: changed",
        mermaid: "flowchart TD\n n0-->n1\n class n0 changed;" },
      { type: "diagram", id: "api-surface", title: "API surface", kind: "architecture",
        d2: "client -> api\napi.class: added", mermaid: "flowchart TD\n client-->api\n class api added;" },
    ];
    const w = lintBlocks(baseline);
    const diagramWarnings = w.filter((m) => m.includes("diagram") || m.includes("diagrams"));
    expect(diagramWarnings).toEqual([]); // baseline must be clean
  });
});
