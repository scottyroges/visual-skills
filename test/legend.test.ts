import { describe, it, expect } from "vitest";
import { rolesInSource } from "../src/diagram-colors.js";
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
