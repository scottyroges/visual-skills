import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("sets failed=true on the placeholder, falsy on a valid render", async () => {
    const bad = await renderDiagram(
      { type: "diagram", id: "bad", title: "Bad", kind: "flowchart", d2: "x: {" },
      { excalidraw: false },
    );
    expect(bad.failed).toBe(true);
    const good = await renderDiagram(
      { type: "diagram", id: "good", title: "Good", kind: "flowchart", d2: "a -> b" },
      { excalidraw: false },
    );
    expect(good.failed).toBeFalsy();
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
    const dir = await mkdtemp(join(tmpdir(), "vs-diag-"));
    try {
      let converted = false;
      const out = await renderDiagram(
        block,
        { outDir: dir, excalidraw: true },
        { ready: async () => true, convert: async () => { converted = true; return { svg: "<svg id='x'/>", scene: {} }; } },
      );
      expect(converted).toBe(true);
      expect(out.renderer).toBe("excalidraw");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("routes an eligible class block (with mermaid) to the excalidraw upgrade", async () => {
    const block: DiagramBlock = {
      type: "diagram", id: "cls", title: "Cls", kind: "class",
      d2: "A -> B",
      mermaid: "classDiagram\n  A <|-- B",
    };
    const dir = await mkdtemp(join(tmpdir(), "vs-diag-"));
    try {
      let converted = false;
      const out = await renderDiagram(
        block,
        { outDir: dir, excalidraw: true },
        { ready: async () => true, convert: async () => { converted = true; return { svg: "<svg id='x'/>", scene: {} }; } },
      );
      expect(converted).toBe(true);
      expect(out.renderer).toBe("excalidraw");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("excalidraw:false forces the d2 floor even when the toolchain is ready (the --no-excalidraw path)", async () => {
    const block: DiagramBlock = {
      type: "diagram", id: "seq", title: "Seq", kind: "sequence",
      d2: "shape: sequence_diagram\na -> b: hi",
      mermaid: "sequenceDiagram\n  a->>b: hi",
    };
    let converted = false;
    const out = await renderDiagram(
      block,
      { excalidraw: false },
      { ready: async () => true, convert: async () => { converted = true; return { svg: "<svg id='x'/>", scene: {} }; } },
    );
    expect(converted).toBe(false);       // never attempted the upgrade
    expect(out.renderer).toBe("d2");
    expect(out.editable).toBeNull();     // no .excalidraw sidecar
  }, 30_000);

  it("injects the color prelude so a class resolves, and leaves class-less diagrams intact", async () => {
    const colored = await renderDiagram(
      { type: "diagram", id: "k", title: "k", kind: "flowchart", d2: "n: { class: external }" },
      { excalidraw: false },
    );
    expect(colored.svg.toLowerCase()).toContain("f1f3f5"); // external fill
    const plain = await renderDiagram(
      { type: "diagram", id: "p", title: "p", kind: "flowchart", d2: "a -> b" },
      { excalidraw: false },
    );
    expect(plain.svg).toMatch(/<svg/); // prelude is harmless when unused
  }, 30_000);
});

describe("renderDiagram — shapeless source", () => {
  it("reports a shapeless diagram as such (d2 exits 0 but writes no SVG)", async () => {
    const warnings: string[] = [];
    const out = await renderDiagram(
      { type: "diagram", id: "empty", title: "Empty", kind: "architecture", d2: "direction: right" },
      { onWarn: (w) => warnings.push(w) },
    );
    expect(out.failed).toBe(true);
    // The old behaviour surfaced a confusing ENOENT on a temp path instead.
    expect(warnings.join(" ")).toContain("declares no shapes");
    expect(warnings.join(" ")).not.toContain("ENOENT");
  });
});
