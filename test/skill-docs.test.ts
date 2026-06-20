import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const blocks = read("../src/blocks.ts");
const specBlocks = read("../src/spec-blocks.ts");
const planSkill = read("../skills/visual-plan/SKILL.md");
const recapSkill = read("../skills/visual-recap/SKILL.md");
const specSkill = read("../skills/visual-spec/SKILL.md");
const atlasBlocks = read("../src/atlas-blocks.ts");
const atlasSkill = read("../skills/visual-atlas/SKILL.md");

// Discriminant literals like `type: "diagram"` across the Block interfaces.
const blockTypes = [...new Set([...blocks.matchAll(/\btype:\s*"([^"]+)"/g)].map((m) => m[1]))];
const specBlockTypes = [...new Set([...specBlocks.matchAll(/\btype:\s*"([^"]+)"/g)].map((m) => m[1]))];
// Exclude "diagram": it's the embedded DiagramBlock primitive returned by atlasDiagramToBlock,
// not a member of the AtlasBlock union (which is what the SKILL must document).
const atlasBlockTypes = [...new Set([...atlasBlocks.matchAll(/\btype:\s*"([^"]+)"/g)].map((m) => m[1]))]
  .filter((t) => t !== "diagram");

describe("skill docs stay in sync", () => {
  it("documents every Block type in the visual-plan skill", () => {
    expect(blockTypes.length).toBeGreaterThanOrEqual(8);
    for (const t of blockTypes) {
      // Require the backtick-quoted form (e.g. `prose`) so the check is non-vacuous —
      // a bare substring like "api" or "schema" can match incidentally in examples/prose.
      expect(planSkill, `visual-plan SKILL.md must document block type \`${t}\``).toContain(`\`${t}\``);
    }
  });

  it("documents every spec block type in the visual-spec skill", () => {
    expect(specBlockTypes.length).toBeGreaterThanOrEqual(11);
    for (const t of specBlockTypes) {
      expect(specSkill, `visual-spec SKILL.md must document spec block type \`${t}\``).toContain(`\`${t}\``);
    }
  });

  it("documents every atlas block type in the visual-atlas skill", () => {
    expect(atlasBlockTypes.length).toBeGreaterThanOrEqual(8);
    for (const t of atlasBlockTypes) {
      expect(atlasSkill, `visual-atlas SKILL.md must document block type \`${t}\``).toContain(`\`${t}\``);
    }
  });

  it("visual-atlas has frontmatter and references both the catalog and diagram catalog", () => {
    expect(atlasSkill.startsWith("---")).toBe(true);
    expect(atlasSkill).toMatch(/\nname:\s*visual-atlas/);
    expect(atlasSkill).toMatch(/\ndescription:\s*\S+/);
    expect(atlasSkill).toContain("skills/shared/atlas-components.md");
    expect(atlasSkill).toContain("skills/shared/diagrams.md");
  });

  it("visual-atlas mandates the standard and the three modes", () => {
    for (const s of ["atlas-tldr", "domain-map", "domain-index", "seams", "--repo", "--domain", "--blocks", "atlas.domains.json"]) {
      expect(atlasSkill, `visual-atlas SKILL.md must mention "${s}"`).toContain(s);
    }
  });

  it("all skills have name + description frontmatter", () => {
    for (const md of [planSkill, recapSkill, specSkill, atlasSkill]) {
      expect(md.startsWith("---")).toBe(true);
      expect(md).toMatch(/\nname:\s*\S+/);
      expect(md).toMatch(/\ndescription:\s*\S+/);
    }
  });

  it("visual-spec mandates the standard (lead, decisions+why, scope, approval) and references both catalogs", () => {
    for (const s of ["tldr", "decisions", "why", "scope", "approve", "rejected"]) {
      expect(specSkill, `visual-spec SKILL.md must mention "${s}"`).toContain(s);
    }
    expect(specSkill).toContain("skills/shared/spec-components.md");
    expect(specSkill).toContain("skills/shared/diagrams.md");
  });

  it("both skills reference the shared diagram catalog", () => {
    for (const md of [planSkill, recapSkill]) {
      expect(md).toContain("skills/shared/diagrams.md");
    }
  });

  it("visual-recap documents catalog-driven, possibly-multiple diagrams via tabs", () => {
    expect(recapSkill).toContain("--emit-blocks");
    expect(recapSkill).toContain("catalog");
    expect(recapSkill).toContain('"type": "tabs"');
  });

  it("visual-recap documents the review-narrative enrichment", () => {
    // The standard mandates an authored lead with a TL;DR (facets + risk), annotated diffs
    // (description), and a grouped narrative.
    expect(recapSkill).toContain("facets");
    expect(recapSkill).toContain("risk");
    expect(recapSkill).toContain("description");
    expect(recapSkill).toContain("group");
  });

  it("visual-recap documents attaching a diagram to a diff", () => {
    expect(recapSkill).toContain('"diagram":');
  });

  it("visual-recap documents leading with an overview block", () => {
    expect(recapSkill).toContain('"type": "overview"');
  });
});
