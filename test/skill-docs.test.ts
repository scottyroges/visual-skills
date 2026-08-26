import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const blocks = read("../src/blocks.ts");
const specBlocks = read("../src/spec-blocks.ts");
const docSkill = read("../skills/visual-doc/SKILL.md");
const recapSkill = read("../skills/visual-recap/SKILL.md");
const specSkill = read("../skills/visual-spec/SKILL.md");
const atlasBlocks = read("../src/atlas-blocks.ts");
const atlasSkill = read("../skills/visual-atlas/SKILL.md");
const atlasCatalog = read("../skills/shared/atlas-components.md");
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

  it("VISUAL_SKILLS_DIR is the stable indirection line — never a literal machine path", () => {
    // The installer no longer stamps SKILL.md; every skill must carry the stable form that
    // resolves through the <claudeRoot>/visual-skills symlink. A literal path (stamped or
    // hand-edited) would dirty the repo and break other clones.
    const STABLE = 'VISUAL_SKILLS_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/visual-skills"';
    const skills = { docSkill, recapSkill, specSkill, atlasSkill, atlasReviewSkill, quizSkill };
    for (const [name, md] of Object.entries(skills)) {
      expect(md, `${name} must carry the stable tool-location line`).toContain(STABLE);
      for (const [, dir] of md.matchAll(/VISUAL_SKILLS_DIR=(\S+)/g)) {
        expect(dir.startsWith('"${CLAUDE_CONFIG_DIR'),
          `${name}: VISUAL_SKILLS_DIR=${dir} must be the stable line, not a literal path`).toBe(true);
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

  it("all skills require the shared plain-language guide", () => {
    const guide = "skills/shared/plain-language.md";
    expect(existsSync(new URL(`../${guide}`, import.meta.url)), `${guide} must exist`).toBe(true);
    const skills = { docSkill, recapSkill, specSkill, atlasSkill, atlasReviewSkill, quizSkill };
    for (const [name, md] of Object.entries(skills)) {
      expect(md, `${name} must require ${guide}`).toContain(guide);
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

  it("visual-atlas teaches recursive reader-owned topics and flexible evidence scopes", () => {
    for (const phrase of [
      "recursive topic",
      "root-level topic",
      "include",
      "exclude",
      "overlap",
      "mechanism",
      "algorithm",
      "data-model",
      "lifecycle",
      "integration",
      "current truth",
      "1,200",
      "2,000",
    ]) {
      expect(atlasSkill.toLowerCase(), `visual-atlas must teach ${phrase}`).toContain(phrase.toLowerCase());
    }
    expect(atlasSkill).toMatch(/scanner.{0,100}never.{0,100}(?:create|move|mutate)/is);
    expect(atlasSkill).toMatch(/child (?:page )?card/i);
  });

  it("visual-atlas accounts for behavior before choosing the page tree", () => {
    const discoveryHeading = "## Discover behavior before choosing pages";
    const pageTreeHeading = "## Choose the page tree before writing prose";
    const discovery = atlasSkill.indexOf(discoveryHeading);
    const pageTree = atlasSkill.indexOf(pageTreeHeading);
    expect(discovery).toBeGreaterThan(-1);
    expect(pageTree).toBeGreaterThan(discovery);

    const contract = atlasSkill.slice(discovery, pageTree);
    for (const phrase of [
      "journey trace",
      "responsibility ledger",
      "documentation disposition",
      "boundary crossings",
      "convergence",
      "durable writes",
      "terminal signaling",
      "recovery",
      "cleanup",
      "responsibility in reader language",
      "why it matters",
      "journey or invariant",
      "summarize it on the domain landing page",
      "topic or nested topic page",
      "canonical home",
      "omit it with a concrete reason",
      "source groups cover",
      "related and reading-path links",
      "final handoff",
      "central orchestrators",
    ]) {
      expect(contract.toLowerCase(), `visual-atlas discovery contract must require ${phrase}`)
        .toContain(phrase.toLowerCase());
    }

    const singleDomain = atlasSkill.slice(
      atlasSkill.indexOf("### 2. Single domain"),
      atlasSkill.indexOf("### 3. Render-only"),
    );
    expect(singleDomain).toContain("Refresh the journey traces and responsibility ledger");
  });

  it("visual-atlas examples stay repository-neutral", () => {
    expect(atlasSkill.toLowerCase()).not.toContain("telltale");
    expect(atlasSkill.toLowerCase()).not.toContain("conversation-engine");
  });

  it("visual-atlas requires child pages to earn their depth", () => {
    const heading = "## Earn every child page";
    const substance = atlasSkill.indexOf(heading);
    const workflow = atlasSkill.indexOf("## Workflow (three modes)");
    expect(substance).toBeGreaterThan(-1);
    expect(workflow).toBeGreaterThan(substance);

    const contract = atlasSkill.slice(substance, workflow).toLowerCase();
    for (const phrase of [
      "teaching brief",
      "reader question",
      "mental model",
      "predict",
      "representative case",
      "progressive disclosure",
      "hard integrity",
      "advisory",
    ]) {
      expect(contract, `visual-atlas substance contract must require ${phrase}`).toContain(phrase);
    }

    for (const phrase of [
      "shape-specific teaching contracts",
      "mechanism",
      "algorithm",
      "lifecycle",
      "integration",
      "data model",
      "concrete values",
      "state transition",
      "worked trace",
    ]) {
      expect(atlasCatalog.toLowerCase(), `atlas catalog must explain ${phrase}`)
        .toContain(phrase.toLowerCase());
    }

    expect(atlasSkill.split("\n").length).toBeLessThanOrEqual(500);
  });

  it("atlas-review rewrites coherent current truth and scopes review per page", () => {
    for (const phrase of [
      "smallest coherent current-truth update",
      "project history",
      "stale page",
      "parent summary",
      "independent stamp",
    ]) {
      expect(atlasReviewSkill.toLowerCase(), `atlas-review must teach ${phrase}`).toContain(phrase.toLowerCase());
    }
    expect(atlasReviewSkill).toMatch(/do not preserve.{0,120}sentence/is);
    expect(atlasReviewSkill).toMatch(/rewrite.{0,120}current (?:truth|explanation)/is);
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

  it("documents the example block in all four surface skills", () => {
    // blocks.ts's discriminant only auto-forces visual-doc; spec/atlas import the type
    // rather than redeclaring the literal, so lock all four explicitly.
    for (const [name, text] of [
      ["visual-doc", docSkill], ["visual-recap", recapSkill],
      ["visual-spec", specSkill], ["visual-atlas", atlasSkill],
    ] as const) {
      expect(text, `${name} SKILL.md must document \`example\``).toContain("`example`");
    }
  });
});
