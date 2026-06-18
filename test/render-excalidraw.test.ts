import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderDiagram } from "../src/render-diagram.js";
import type { DiagramBlock } from "../src/blocks.js";

const flow: DiagramBlock = {
  type: "diagram", id: "flow", title: "Flow", kind: "flowchart",
  d2: "a -> b", mermaid: "graph TD\nA-->B",
};

describe("renderDiagram excalidraw seam", () => {
  it("uses the injected excalidraw path when ready, writing a .excalidraw scene", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vs-exc-"));
    try {
      const out = await renderDiagram(
        flow,
        { outDir: dir },
        {
          ready: async () => true,
          convert: async () => ({ svg: "<svg id='fake'></svg>", scene: { type: "excalidraw" } }),
        },
      );
      expect(out.renderer).toBe("excalidraw");
      expect(out.svg).toContain("fake");
      expect(out.editable).toBe(join(dir, "flow.excalidraw"));
      const scene = JSON.parse(await readFile(join(dir, "flow.excalidraw"), "utf8"));
      expect(scene.type).toBe("excalidraw");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("falls back to the d2 floor when the injected conversion throws (and warns)", async () => {
    const warnings: string[] = [];
    const out = await renderDiagram(
      flow,
      { onWarn: (m) => warnings.push(m) },
      { ready: async () => true, convert: async () => { throw new Error("boom-exc"); } },
    );
    expect(out.renderer).toBe("d2");
    expect(out.svg).toMatch(/<svg/);
    expect(warnings.some((w) => w.includes("boom-exc"))).toBe(true);
  }, 30_000);

  it("renders dark-ink label text, not the role's stroke color, for a colored node (real path)", async () => {
    // Real conversion (no mock). With excalidraw available this exercises the excalidraw path
    // (which otherwise colors label text with the node's stroke); without it, the d2 floor — either
    // way the label text must be dark ink, never the orange `changed` stroke (#f08c00).
    const dir = await mkdtemp(join(tmpdir(), "vs-ink-"));
    try {
      const colored: DiagramBlock = {
        type: "diagram", id: "c", title: "C", kind: "flowchart",
        d2: "x: { class: changed }",
        mermaid: "graph TD\n  x[x]:::changed\n  classDef changed fill:#ffd43b,stroke:#f08c00,color:#1b1b1b,stroke-width:2px;",
      };
      const out = await renderDiagram(colored, { outDir: dir });
      expect(out.svg).toMatch(/<text[^>]*fill="#1b1b1b"/i);   // label text is dark ink
      expect(out.svg).not.toMatch(/<text[^>]*fill="#f08c00"/i); // never the stroke color
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("never attempts the upgrade for an ineligible kind", async () => {
    let called = false;
    const erd: DiagramBlock = { type: "diagram", id: "e", title: "E", kind: "erd", d2: "a -> b", mermaid: "graph TD\nA-->B" };
    const out = await renderDiagram(
      erd,
      {},
      { ready: async () => true, convert: async () => { called = true; throw new Error("should not run"); } },
    );
    expect(called).toBe(false);
    expect(out.renderer).toBe("d2");
  }, 30_000);
});
