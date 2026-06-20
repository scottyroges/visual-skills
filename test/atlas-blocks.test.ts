import { describe, it, expect } from "vitest";
import {
  assertUniqueAtlasIds, collectAtlasDiagrams, isAtlasChapter, atlasChapterLabel, LAYER_DOTS,
  type AtlasBlock,
} from "../src/atlas-blocks.js";

const depth: AtlasBlock = {
  type: "depth", id: "depth", title: "In depth",
  components: [
    { id: "c-gm", name: "gm", path: "lib/brain/gm", detail: ["x"],
      diagrams: [{ id: "gm-plan", kind: "architecture", d2: "a -> b" }] },
  ],
};
const arch: AtlasBlock = { type: "diagram-section", id: "arch", diagram: { id: "brain-arch", kind: "architecture", d2: "a -> b" } };
const tldr: AtlasBlock = { type: "domain-tldr", id: "tldr", heading: "h", rows: [] };

describe("atlas-blocks helpers", () => {
  it("collects diagrams from diagram-section AND depth components", () => {
    const ids = collectAtlasDiagrams([tldr, arch, depth]).map((d) => d.id);
    expect(ids).toEqual(["brain-arch", "gm-plan"]);
  });
  it("rejects duplicate ids across blocks, deep components, and diagrams", () => {
    expect(() => assertUniqueAtlasIds([arch, { ...arch }])).toThrow(/duplicate/);
    expect(() => assertUniqueAtlasIds([depth, { type: "diagram-section", id: "x", diagram: { id: "gm-plan", kind: "architecture", d2: "a" } }])).toThrow(/duplicate/);
  });
  it("rejects a diagram-section whose id collides with its own diagram id", () => {
    expect(() => assertUniqueAtlasIds([{ type: "diagram-section", id: "x", diagram: { id: "x", kind: "architecture", d2: "a" } }])).toThrow(/duplicate/);
  });
  it("treats tldr as the lead (not a chapter) and others as chapters", () => {
    expect(isAtlasChapter(tldr)).toBe(false);
    expect(isAtlasChapter({ type: "atlas-tldr", id: "tldr", heading: "h", rows: [] })).toBe(false);
    expect(isAtlasChapter(arch)).toBe(true);
    expect(atlasChapterLabel(depth)).toBe("In depth");
  });
  it("maps every layer to a dot color", () => {
    for (const l of ["foundation","engine","intelligence","narrative","surface","harness"] as const)
      expect(LAYER_DOTS[l]).toMatch(/^#([0-9a-f]{6});#([0-9a-f]{6})$/i);
  });
});
