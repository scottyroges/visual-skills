import { describe, it, expect } from "vitest";
import { renderDiagram } from "../src/render-diagram.js";
import type { DiagramBlock } from "../src/blocks.js";

describe("renderDiagram (D2 floor)", () => {
  it("compiles a flowchart block to sketch SVG", async () => {
    const block: DiagramBlock = {
      type: "diagram", id: "flow", title: "Flow", kind: "flowchart",
      d2: "spec -> blocks -> html",
    };
    const out = await renderDiagram(block, { excalidraw: false });
    expect(out.renderer).toBe("d2");
    expect(out.svg).toMatch(/<svg/);
    expect(out.editable).toBeNull();
    expect(out.id).toBe("flow");
  });

  it("degrades to a placeholder svg (not a throw) when d2 fails to compile", async () => {
    const warnings: string[] = [];
    const block: DiagramBlock = {
      type: "diagram", id: "broken", title: "Broken", kind: "flowchart",
      d2: "x: {",   // unclosed block — d2 fails to compile
    };
    const out = await renderDiagram(block, { excalidraw: false, onWarn: (m) => warnings.push(m) });
    expect(out.renderer).toBe("d2");
    expect(out.editable).toBeNull();
    expect(out.svg).toMatch(/<svg/);
    expect(out.svg.toLowerCase()).toContain("failed to render");
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it("throws when a diagram block has no d2 source", async () => {
    // @ts-expect-error intentionally missing d2
    await expect(renderDiagram({ type: "diagram", id: "x", title: "x", kind: "flowchart" }, {}))
      .rejects.toThrow(/d2 source/);
  });

  it("routes an eligible sequence block (with mermaid) to the excalidraw upgrade", async () => {
    const block: DiagramBlock = {
      type: "diagram", id: "seq", title: "Seq", kind: "sequence",
      d2: "shape: sequence_diagram\na -> b: hi",
      mermaid: "sequenceDiagram\n  a->>b: hi",
    };
    let converted = false;
    const out = await renderDiagram(
      block,
      {},
      { ready: async () => true, convert: async () => { converted = true; return { svg: "<svg id='x'/>", scene: {} }; } },
    );
    expect(converted).toBe(true);
    expect(out.renderer).toBe("excalidraw");
  }, 30_000);

  it("routes an eligible class block (with mermaid) to the excalidraw upgrade", async () => {
    const block: DiagramBlock = {
      type: "diagram", id: "cls", title: "Cls", kind: "class",
      d2: "A -> B",
      mermaid: "classDiagram\n  A <|-- B",
    };
    let converted = false;
    const out = await renderDiagram(
      block,
      {},
      { ready: async () => true, convert: async () => { converted = true; return { svg: "<svg id='x'/>", scene: {} }; } },
    );
    expect(converted).toBe(true);
    expect(out.renderer).toBe("excalidraw");
  }, 30_000);
});
