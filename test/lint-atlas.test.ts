import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lintAtlas, lintDomain } from "../src/lint-atlas.js";
import type { AtlasBlock } from "../src/atlas-blocks.js";

const load = (f: string): AtlasBlock[] =>
  JSON.parse(readFileSync(join(__dirname, "..", "example", "atlas-sports-rpg", f), "utf8")).blocks;

describe("lintAtlas", () => {
  it("is clean on the canonical atlas page", () => {
    expect(lintAtlas(load("atlas.json"))).toEqual([]);
  });

  it("warns on a bare atlas: missing tldr, map, index", () => {
    const warns = lintAtlas([
      { type: "diagram-section", id: "x", title: "X",
        diagram: { id: "xd", kind: "flowchart", d2: "a -> b" } },
    ] as AtlasBlock[]);
    expect(warns.some((w) => /start here|atlas-tldr|tl;dr/i.test(w))).toBe(true);
    expect(warns.some((w) => /domain map/i.test(w))).toBe(true);
    expect(warns.some((w) => /domain.index|tile/i.test(w))).toBe(true);
  });

  it("warns when a domain tile has no purpose", () => {
    const warns = lintAtlas([
      { type: "atlas-tldr", id: "tldr", heading: "Demo", rows: [] },
      { type: "domain-map", id: "map", svg: "<svg></svg>" },
      { type: "domain-index", id: "domains", title: "Domains", tiles: [
        { name: "sim", path: "lib/sim", layer: "engine", layerLabel: "Engine", purpose: "", href: "domain-sim.html" },
      ] },
    ] as AtlasBlock[]);
    expect(warns.some((w) => /purpose/i.test(w))).toBe(true);
  });
});

describe("lintDomain", () => {
  it("is clean on the canonical domain page", () => {
    expect(lintDomain(load("domain-brain/domain-brain.json"))).toEqual([]);
  });

  it("warns on a bare domain: missing tldr, components, seams", () => {
    const warns = lintDomain([
      { type: "diagram-section", id: "arch", title: "Arch",
        diagram: { id: "ad", kind: "architecture", d2: "a -> b" } },
    ] as AtlasBlock[]);
    expect(warns.some((w) => /domain-tldr|tl;dr/i.test(w))).toBe(true);
    expect(warns.some((w) => /component/i.test(w))).toBe(true);
    expect(warns.some((w) => /seam/i.test(w))).toBe(true);
  });

  it("warns when a large domain (many components) has no internal-arch diagram", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: `c-${i}`, name: `c${i}`, path: `lib/x/c${i}`, detail: [""],
    }));
    const warns = lintDomain([
      { type: "domain-tldr", id: "tldr", heading: "X", rows: [] },
      { type: "components", id: "components", title: "Components", cards: [] },
      { type: "depth", id: "depth", title: "In depth", components: many },
      { type: "seams", id: "seams", title: "Seams", exposes: [], depends: [] },
    ] as AtlasBlock[]);
    expect(warns.some((w) => /internal arch|diagram/i.test(w))).toBe(true);
  });
});
