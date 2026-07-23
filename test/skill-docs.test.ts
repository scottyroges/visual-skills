import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const blocks = read("../src/blocks.ts");
const specBlocks = read("../src/spec-blocks.ts");
const docSkill = read("../skills/visual-doc/SKILL.md");
const recapSkill = read("../skills/visual-recap/SKILL.md");
const specSkill = read("../skills/visual-spec/SKILL.md");
const atlasBlocks = read("../src/atlas-blocks.ts");
const atlasSkill = read("../skills/visual-atlas/SKILL.md");
const atlasReviewSkill = read("../skills/atlas-review/SKILL.md");
const quizBlocks = read("../src/quiz-blocks.ts");
const quizSkill = read("../skills/quiz/SKILL.md");

// Discriminant literals like `type: "diagram"` across the Block interfaces.
const blockTypes = [...new Set([...blocks.matchAll(/\btype:\s*"([^"]+)"/g)].map((m) => m[1]))];
const specBlockTypes = [...new Set([...specBlocks.matchAll(/\btype:\s*"([^"]+)"/g)].map((m) => m[1]))];
// Exclude "diagram": it's the embedded DiagramBlock primitive returned by atlasDiagramToBlock,
// not a member of the AtlasBlock union (which is what the SKILL must document).
const atlasBlockTypes = [...new Set([...atlasBlocks.matchAll(/\btype:\s*"([^"]+)"/g)].map((m) => m[1]))]
  .filter((t) => t !== "diagram");
// No filter needed: quiz-blocks.ts only declares discriminant literals for its own union
// members (quiz-question, quiz-group) — shared primitives (annotated-code, diagram, prose) are
// type-imported from blocks.ts, so their `type: "…"` literals never appear in this file's text.
// A future QuizBlock member's discriminant will show up here automatically.
const quizBlockTypes = [...new Set([...quizBlocks.matchAll(/\btype:\s*"([^"]+)"/g)].map((m) => m[1]))];

describe("skill docs stay in sync", () => {
  it("documents every Block type in the visual-doc skill", () => {
    expect(blockTypes.length).toBeGreaterThanOrEqual(8);
    for (const t of blockTypes) {
      // Require the backtick-quoted form (e.g. `prose`) so the check is non-vacuous —
      // a bare substring like "api" or "schema" can match incidentally in examples/prose.
      expect(docSkill, `visual-doc SKILL.md must document block type \`${t}\``).toContain(`\`${t}\``);
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

  it("VISUAL_SKILLS_DIR is the placeholder or this clone — never someone else's machine", () => {
    // The committed value must be the documented placeholder; after `npm run skills:install`
    // it may be stamped to THIS repo root. Anything else (e.g. a committed home dir from
    // another machine) would break every fresh clone.
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const allowed = ["/path/to/visual-skills", repoRoot];
    for (const md of [docSkill, recapSkill, specSkill, atlasSkill, atlasReviewSkill]) {
      for (const [, dir] of md.matchAll(/VISUAL_SKILLS_DIR=(\S+)/g)) {
        expect(allowed, `VISUAL_SKILLS_DIR=${dir} must be the placeholder or this clone`).toContain(dir);
      }
    }
  });

  it("all skills have name + description frontmatter", () => {
    for (const md of [docSkill, recapSkill, specSkill, atlasSkill, atlasReviewSkill]) {
      expect(md.startsWith("---")).toBe(true);
      expect(md).toMatch(/\nname:\s*\S+/);
      expect(md).toMatch(/\ndescription:\s*\S+/);
    }
  });

  it("visual-atlas documents the drift checker and stamping", () => {
    for (const s of ["atlas-check.mjs", "--stamp", "verifiedAgainst", "pre-commit"]) {
      expect(atlasSkill, `visual-atlas SKILL.md must mention "${s}"`).toContain(s);
    }
  });

  it("atlas-review mandates the review loop (diff → judge → re-render → re-stamp)", () => {
    for (const s of [
      "atlas-check.mjs",
      "--stamp",
      "verifiedAgainst.commit",
      "git",
      "re-render",
      "visual-atlas",
      "Never stamp",
    ]) {
      expect(atlasReviewSkill, `atlas-review SKILL.md must mention "${s}"`).toContain(s);
    }
    expect(atlasReviewSkill).toContain("skills/shared/atlas-components.md");
    expect(atlasReviewSkill).toContain("src/atlas-blocks.ts");
  });

  it("visual-spec mandates the standard (lead, decisions+why, scope, approval) and references both catalogs", () => {
    for (const s of ["tldr", "decisions", "why", "scope", "approve", "rejected"]) {
      expect(specSkill, `visual-spec SKILL.md must mention "${s}"`).toContain(s);
    }
    expect(specSkill).toContain("skills/shared/spec-components.md");
    expect(specSkill).toContain("skills/shared/diagrams.md");
  });

  it("both skills reference the shared diagram catalog", () => {
    for (const md of [docSkill, recapSkill]) {
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

  it("documents every quiz block type in the quiz skill", () => {
    expect(quizBlockTypes.length).toBeGreaterThanOrEqual(2);
    for (const t of quizBlockTypes) {
      expect(quizSkill, `quiz SKILL.md must document quiz block type \`${t}\``).toContain(`\`${t}\``);
    }
  });
});
