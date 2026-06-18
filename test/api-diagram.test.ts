import { describe, it, expect } from "vitest";
import { apiSurfaceDiagram } from "../src/api-diagram.js";
import { renderDiagram } from "../src/render-diagram.js";
import type { ApiProcedure } from "../src/blocks.js";

const procs: ApiProcedure[] = [
  { name: "league.captureOrder", auth: "protected", kind: "mutation", input: "", change: "added" },
  { name: "league.createCheckout", auth: "protected", kind: "mutation", input: "", change: "removed" },
  { name: "user.me", auth: "public", kind: "query", input: "" },
];

describe("apiSurfaceDiagram", () => {
  it("returns null for no procedures", () => {
    expect(apiSurfaceDiagram([])).toBeNull();
  });

  it("groups by router and reflects changes in both d2 and mermaid", () => {
    const block = apiSurfaceDiagram(procs)!;
    expect(block.type).toBe("diagram");
    expect(block.kind).toBe("architecture");
    // d2 floor: quoted router container + change fill
    expect(block.d2).toContain('"league"');
    expect(block.d2).toContain('"captureOrder"');
    expect(block.d2).toContain("class:");
    // specific change->role mapping: the added procedure carries class: added
    expect(block.d2).toContain("class: added");
    expect(block.mermaid).toContain("classDef");
    expect(block.d2).toContain('client -> "league"');
    // mermaid upgrade: dot-free ids, labels keep names, change classes
    expect(block.mermaid).toContain("graph LR");
    expect(block.mermaid).toContain("subgraph league");
    expect(block.mermaid).toContain('league_captureOrder["captureOrder"]');
    expect(block.mermaid).toContain("class league_captureOrder added;");
    expect(block.mermaid).not.toMatch(/\bleague\.captureOrder\b/); // ids never contain dots
  });

  it("emits d2 that compiles via the d2 binary", async () => {
    const block = apiSurfaceDiagram(procs)!;
    const out = await renderDiagram(block, { excalidraw: false });
    expect(out.svg).toMatch(/<svg/);
    expect(out.svg).not.toContain("failed to render");
  }, 30_000);
});
