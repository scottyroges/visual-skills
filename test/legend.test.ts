import { describe, it, expect } from "vitest";
import { rolesInSource, legendRolesForRender } from "../src/diagram-colors.js";
import { renderLegend } from "../src/renderers/legend.js";

describe("rolesInSource", () => {
  it("detects roles applied in d2 and mermaid, ignoring classDef definitions, in PALETTE order", () => {
    const d2 = "x: { class: changed }\ndb: { class: store }";
    const mermaid = "flowchart TD\n a:::actor\n classDef changed fill:#fff;";
    // 'changed' (d2 apply) + 'store' (d2 apply) + 'actor' (mermaid apply).
    // The mermaid `classDef changed` is a definition, not an application -> not double-counted noise.
    expect(rolesInSource(d2, mermaid)).toEqual(["changed", "actor", "store"]);
  });

  it("returns nothing for a diagram that applies no roles", () => {
    expect(rolesInSource("a -> b", undefined)).toEqual([]);
  });
});

describe("legendRolesForRender", () => {
  // A sequence: d2 carries class colors, but the mermaid sequence has no class mechanism.
  const seqD2 = "shape: sequence_diagram\nclient: { class: actor }\ndb: { class: store }\nclient -> db: q";
  const seqMermaid = "sequenceDiagram\n  client->>db: q";

  it("uses d2 roles when the d2 SVG is rendered", () => {
    expect(legendRolesForRender(seqD2, seqMermaid, "d2")).toEqual(["actor", "store"]);
  });

  it("uses mermaid-only roles when the Excalidraw scene is rendered (sequence => none)", () => {
    // The rendered artifact is the colorless mermaid sequence, so the legend must be empty.
    expect(legendRolesForRender(seqD2, seqMermaid, "excalidraw")).toEqual([]);
  });

  it("keeps flowchart colors in the Excalidraw legend (mermaid classDefs convert)", () => {
    const d2 = "a: { class: changed }\na -> b";
    const mermaid = "flowchart LR\n A-->B\n classDef changed fill:#fff;\n class A changed;";
    expect(legendRolesForRender(d2, mermaid, "excalidraw")).toEqual(["changed"]);
  });
});

describe("renderLegend", () => {
  it("renders a swatch + label per role, empty string when no roles", () => {
    expect(renderLegend([])).toBe("");
    const html = renderLegend(["changed", "store"]);
    expect(html).toContain('class="vs-legend"');
    expect(html).toContain("Changed");
    expect(html).toContain("Datastore");
    expect(html).toContain("#ffd43b"); // changed fill swatch
  });
});
