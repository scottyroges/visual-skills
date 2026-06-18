import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const blocks = read("../src/blocks.ts");
const planSkill = read("../skills/visual-plan/SKILL.md");
const recapSkill = read("../skills/visual-recap/SKILL.md");

// Discriminant literals like `type: "diagram"` across the Block interfaces.
const blockTypes = [...new Set([...blocks.matchAll(/\btype:\s*"([^"]+)"/g)].map((m) => m[1]))];

describe("skill docs stay in sync", () => {
  it("documents every Block type in the visual-plan skill", () => {
    expect(blockTypes.length).toBeGreaterThanOrEqual(8);
    for (const t of blockTypes) {
      // Require the backtick-quoted form (e.g. `prose`) so the check is non-vacuous —
      // a bare substring like "api" or "schema" can match incidentally in examples/prose.
      expect(planSkill, `visual-plan SKILL.md must document block type \`${t}\``).toContain(`\`${t}\``);
    }
  });

  it("both skills have name + description frontmatter", () => {
    for (const md of [planSkill, recapSkill]) {
      expect(md.startsWith("---")).toBe(true);
      expect(md).toMatch(/\nname:\s*\S+/);
      expect(md).toMatch(/\ndescription:\s*\S+/);
    }
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
    expect(recapSkill).toContain("Summary");
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
