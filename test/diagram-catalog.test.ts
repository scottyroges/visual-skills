import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderDiagram } from "../src/render-diagram.js";
import { PALETTE } from "../src/diagram-colors.js";
import type { DiagramBlock } from "../src/blocks.js";

const catalog = readFileSync(new URL("../skills/shared/diagrams.md", import.meta.url), "utf8");

const fences = (src: string, lang: string): string[] =>
  [...src.matchAll(new RegExp("```" + lang + "\\s*\\n([\\s\\S]*?)```", "g"))].map((m) => m[1].trim());

// Mermaid headers that convert to EDITABLE excalidraw elements. stateDiagram/erDiagram
// rasterize, so they're forbidden in the catalog (author states as a flowchart instead).
const ALLOWED_MERMAID = /^(graph|flowchart|sequenceDiagram|classDiagram)\b/;

describe("diagram catalog", () => {
  it("has entries and the parse marker", () => {
    expect(catalog).toContain("<!-- catalog-entries-start -->");
  });

  it("compiles every d2 recipe to an svg (no placeholder)", async () => {
    const recipes = fences(catalog, "d2");
    expect(recipes.length).toBeGreaterThanOrEqual(10);
    for (const d2 of recipes) {
      const block: DiagramBlock = { type: "diagram", id: "t", title: "t", kind: "flowchart", d2 };
      const out = await renderDiagram(block, { excalidraw: false });
      expect(out.svg, `recipe failed to compile:\n${d2}`).toMatch(/<svg/);
      expect(out.svg.toLowerCase(), `recipe degraded to placeholder:\n${d2}`).not.toContain("failed to render");
    }
  }, 120_000);

  it("every mermaid recipe uses an editable-supported header", () => {
    const recipes = fences(catalog, "mermaid");
    expect(recipes.length).toBeGreaterThanOrEqual(5);
    for (const m of recipes) {
      expect(m, `mermaid must start with an editable header:\n${m}`).toMatch(ALLOWED_MERMAID);
      expect(m, `stateDiagram/erDiagram rasterize — author as flowchart:\n${m}`).not.toMatch(/^(stateDiagram|erDiagram)/);
    }
  });

  it("documents the color vocabulary and applies a class in at least one recipe", () => {
    expect(catalog).toContain("Color vocabulary");
    expect(catalog).toMatch(/class:\s*(changed|added|removed|actor|external|store)/);
  });

  it("documents each role's classDef with the canonical PALETTE hex (no drift)", () => {
    for (const [role, { fill, stroke }] of Object.entries(PALETTE)) {
      // Matches the catalog's mermaid classDef line regardless of code-block indentation or a
      // trailing stroke-width — so a PALETTE hex edit not mirrored in the catalog fails here.
      expect(catalog, `catalog must document classDef ${role} with PALETTE hex`)
        .toContain(`classDef ${role} fill:${fill},stroke:${stroke}`);
    }
  });

  it("every editable:yes entry pairs d2 with mermaid", () => {
    const body = catalog.slice(catalog.indexOf("<!-- catalog-entries-start -->"));
    const entries = body.split(/\n### /).slice(1); // drop preamble before first entry
    expect(entries.length).toBeGreaterThanOrEqual(10);
    for (const entry of entries) {
      const name = entry.split("\n")[0].trim();
      const editable = /\*\*editable:\*\*\s*yes/.test(entry);
      expect(fences(entry, "d2").length, `entry "${name}" needs a d2 recipe`).toBeGreaterThanOrEqual(1);
      if (editable) {
        expect(fences(entry, "mermaid").length, `editable entry "${name}" needs a mermaid recipe`).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
