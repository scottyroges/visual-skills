# Visual Atlas — Phase 4: Catalog + Skill + Lint + Dogfood Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 4 and 5 (authoring `atlas-components.md` and `SKILL.md`) are **judgment-heavy authoring** done by the controller, not dispatched to a fresh subagent — they require the full atlas design context. The mechanical tasks (1, 2, 3, 6) are TDD and subagent-friendly.

**Goal:** Finish the `visual-atlas` skill: a mechanical completeness lint wired into the renderer (the demo-standard floor), the shared component catalog, the `SKILL.md`, registration in the installer, and a blind dogfood on a different codebase.

**Architecture:** `src/lint-atlas.ts` mirrors `src/lint-spec.ts` — pure functions returning `string[]` warnings (heuristics, never throws), one for the atlas page (`lintAtlas`) and one for a domain page (`lintDomain`), each wired into the matching assembler (`assembleAtlas`/`assembleDomain`) through the existing `onWarn` hook. The two docs mirror the `visual-spec` pair: `skills/shared/atlas-components.md` (the catalog, sibling to `diagrams.md`/`spec-components.md`) and `skills/visual-atlas/SKILL.md` (the standard + the three-mode workflow). `scripts/install-skills.ts` gains `"visual-atlas"`; the doc tests are extended to keep the SKILL in sync with the block model.

**Tech Stack:** TypeScript (ESM, `tsx`), vitest. Docs are markdown.

---

## Locked design decisions

- **D1 — Two lint functions, page-scoped.** `lintAtlas(blocks)` checks the atlas page floor; `lintDomain(blocks)` checks a domain page floor. They wire into `assembleAtlas` / `assembleDomain` respectively (right after `assertUniqueAtlasIds`).
- **D2 — Heuristics, not errors.** Like `lint-spec`, every rule is a `warn` surfaced via `onWarn`; nothing throws. The canonical example renders with **zero** warnings; a bare/unenriched set warns.
- **D3 — Pure on blocks only.** The lint sees only the block array, so cross-file rules (a tile linking to a domain page that wasn't generated; a seam naming a non-existent neighbor) are **out of scope** here — those belong to the scanner's drift report (Phase 3) or a future cross-file check. The renderer lint covers per-page completeness.
- **D4 — "Domain map present" accepts either form.** The canonical atlas uses a hand-authored `domain-map` (raw SVG) block; the scanner emits a `diagram-section` with id `"map"`. `lintAtlas` treats the map as present if EITHER exists.
- **D5 — Generic vocabulary.** Per the project's standing rule, all reusable names in the catalog/SKILL/lint messages stay generic (`spine`, `domain-map`, tiles, `seams`, "Key files", "Key exports"); only the canonical's authored *content* is subject-specific. (See memory `atlas-generic-vocabulary`.)

---

## File structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/lint-atlas.ts` | Create | `lintAtlas` + `lintDomain` — the demo-standard floor. Pure. |
| `src/assemble-atlas.ts` | Modify | Call `lintAtlas`/`lintDomain` via `onWarn` in `assembleAtlas`/`assembleDomain`. |
| `test/lint-atlas.test.ts` | Create | Clean on the canonical; the specific warnings fire on a bare set. |
| `scripts/install-skills.ts` | Modify | Add `"visual-atlas"` to `SKILLS`. |
| `test/install-skills.test.ts` | Modify | Expect the `visual-atlas` link. |
| `skills/shared/atlas-components.md` | Create (authored) | The catalog: how it assembles, page options, atlas + domain section ladders, atlas-only recipes, color/role vocabulary. |
| `skills/visual-atlas/SKILL.md` | Create (authored) | The skill: standard, red flags, three-mode workflow, artifact set, scaling by repo size. |
| `test/skill-docs.test.ts` | Modify | Keep the visual-atlas SKILL in sync with `atlas-blocks.ts` + reference both catalogs + mandate the standard. |

---

## Task 1: `lint-atlas.ts` — `lintAtlas` + `lintDomain`

**Files:**
- Create: `src/lint-atlas.ts`
- Test: `test/lint-atlas.test.ts`

The thresholds and rules below MUST leave the canonical example clean. Canonical block sets (verified in Phase 2):
- `example/atlas-sports-rpg/atlas.json`: `[atlas-tldr, domain-map, diagram-section(spine), domain-index]` — 7 tiles, all with `purpose`.
- `example/atlas-sports-rpg/domain-brain.json`: `[domain-tldr, components, diagram-section(arch), depth, owns, seams]`.

- [ ] **Step 1: Write the failing test**

Create `test/lint-atlas.test.ts`:

```ts
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
    expect(lintDomain(load("domain-brain.json"))).toEqual([]);
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
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/lint-atlas.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `lint-atlas.ts`**

Create `src/lint-atlas.ts`:

```ts
// Document-level completeness lint for visual-atlas — the "demo-standard floor", mirroring
// lint-spec. A bare atlas/domain page that skips the lead, the map, or the index underdelivers;
// these warnings (surfaced via onWarn) nudge the author back to the standard and tell the agent
// which scanner-drafted fields still need enriching. Heuristics, not hard errors.
import type { AtlasBlock, DomainIndexBlock, DepthBlock } from "./atlas-blocks.js";

/** A domain with this many deep-dive components warrants an internal-architecture diagram. */
const LARGE_COMPONENTS = 4;

/** Atlas-page floor: a 'Start here' lead, the domain map, and the tile index with real purposes. */
export function lintAtlas(blocks: AtlasBlock[]): string[] {
  const warns: string[] = [];
  const has = (t: AtlasBlock["type"]) => blocks.some((b) => b.type === t);

  if (!has("atlas-tldr"))
    warns.push("no atlas-tldr — lead with a 'Start here': what the system does in one line and the few things to hold in mind");

  const mapPresent = blocks.some((b) => b.type === "domain-map" || (b.type === "diagram-section" && b.id === "map"));
  if (!mapPresent)
    warns.push("no domain map — a newcomer needs the all-domains picture (a domain-map block or a 'map' diagram-section)");

  const index = blocks.find((b): b is DomainIndexBlock => b.type === "domain-index");
  if (!index) {
    warns.push("no domain-index — the grid of domain tiles is the atlas's onboarding map and reference index");
  } else {
    const noPurpose = index.tiles.filter((t) => !t.purpose?.trim()).length;
    if (noPurpose) warns.push(`${noPurpose} domain tile(s) have no purpose — one line on what each domain is for (enrich the scanner draft)`);
    const noLink = index.tiles.filter((t) => !t.href?.trim()).length;
    if (noLink) warns.push(`${noLink} domain tile(s) link to no page — generate that domain's page or mark it pending deliberately`);
  }

  return warns;
}

/** Domain-page floor: the lead, the components, an internal-arch diagram when large, and the seams. */
export function lintDomain(blocks: AtlasBlock[]): string[] {
  const warns: string[] = [];
  const has = (t: AtlasBlock["type"]) => blocks.some((b) => b.type === t);

  if (!has("domain-tldr"))
    warns.push("no domain-tldr — open with what this domain owns, why it exists, its responsibilities");
  if (!has("components"))
    warns.push("no components block — list the domain's modules/services with a one-line purpose each");

  const depth = blocks.find((b): b is DepthBlock => b.type === "depth");
  const large = (depth?.components.length ?? 0) >= LARGE_COMPONENTS;
  const archPresent = blocks.some((b) => b.type === "diagram-section");
  if (large && !archPresent)
    warns.push("no internal-arch diagram — a domain this size should show how its pieces wire up (a diagram-section)");

  if (!has("seams"))
    warns.push("no seams block — name what the domain exposes and what it depends on from neighbors");

  return warns;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run test/lint-atlas.test.ts` → PASS (including both "clean on canonical" cases). `npx tsc --noEmit` → clean.

> If a "clean on canonical" case fails, do NOT relax the test by editing the canonical — instead inspect which rule fired and adjust the rule's threshold/condition so the canonical (the definition of "good") passes. Report what you changed.

- [ ] **Step 5: Commit**

```bash
git add src/lint-atlas.ts test/lint-atlas.test.ts
git commit -m "feat(atlas): lint-atlas demo-standard floor (lintAtlas + lintDomain)"
```

---

## Task 2: Wire the lint into the assemblers

**Files:**
- Modify: `src/assemble-atlas.ts`
- Test: `test/assemble-atlas.test.ts` (extend the existing file)

- [ ] **Step 1: Write the failing test**

Append to `test/assemble-atlas.test.ts` (match the file's existing import/setup style):

```ts
import { lintAtlas } from "../src/lint-atlas.js";

it("surfaces completeness warnings through onWarn for a bare atlas", async () => {
  const warns: string[] = [];
  await assembleAtlas(
    [{ type: "domain-index", id: "domains", title: "Domains", tiles: [] }] as any,
    { title: "Bare", onWarn: (m) => warns.push(m) },
  );
  expect(warns.some((w) => /atlas-tldr|start here/i.test(w))).toBe(true);
  expect(warns.some((w) => /domain map/i.test(w))).toBe(true);
});

it("emits no completeness warnings for the canonical atlas blocks", async () => {
  const blocks = JSON.parse(
    readFileSync(join(__dirname, "..", "example", "atlas-sports-rpg", "atlas.json"), "utf8"),
  ).blocks;
  const warns: string[] = [];
  await assembleAtlas(blocks, { title: "Canonical", onWarn: (m) => warns.push(m) });
  // Only completeness lint should be silent; diagram-compile warnings (no d2 binary) are separate.
  expect(lintAtlas(blocks)).toEqual([]);
  expect(warns.filter((w) => /no atlas-tldr|no domain map|no domain-index|no purpose/i.test(w))).toEqual([]);
});
```

> Ensure `readFileSync`/`join` are imported at the top of the test file (they may already be).

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/assemble-atlas.test.ts` → the bare-atlas test FAILS (no warnings surfaced yet).

- [ ] **Step 3: Wire the lint in**

In `src/assemble-atlas.ts`:

1. Add the import near the top:

```ts
import { lintAtlas, lintDomain } from "./lint-atlas.js";
```

2. In `assembleAtlas`, after `assertUniqueAtlasIds(blocks);`:

```ts
if (opts.onWarn) for (const w of lintAtlas(blocks)) opts.onWarn(w); // demo-standard floor: lead / map / index
```

3. In `assembleDomain`, after `assertUniqueAtlasIds(blocks);`:

```ts
if (opts.onWarn) for (const w of lintDomain(blocks)) opts.onWarn(w); // demo-standard floor: lead / components / arch / seams
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run test/assemble-atlas.test.ts` → PASS. Full suite `npx vitest run` → green. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/assemble-atlas.ts test/assemble-atlas.test.ts
git commit -m "feat(atlas): wire lint-atlas into the assemblers via onWarn"
```

---

## Task 3: Register `visual-atlas` in the installer

**Files:**
- Modify: `scripts/install-skills.ts`
- Test: `test/install-skills.test.ts`

- [ ] **Step 1: Update the test (failing)**

In `test/install-skills.test.ts`, add the `visual-atlas` link to BOTH expectation arrays (append after `visual-spec`):

```ts
{ source: "/repo/skills/visual-atlas", target: "/home/me/.claude/skills/visual-atlas" },
```
and in the custom-root test:
```ts
"/custom/cc/skills/visual-atlas",
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/install-skills.test.ts` → FAIL (visual-atlas not in `SKILLS`).

- [ ] **Step 3: Add to `SKILLS`**

In `scripts/install-skills.ts`:

```ts
const SKILLS = ["visual-recap", "visual-plan", "visual-spec", "visual-atlas"];
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run test/install-skills.test.ts` → PASS. `npx tsc --noEmit` → clean.

> Note: the symlink will dangle until `skills/visual-atlas/SKILL.md` exists (Task 5). The unit test only checks the pure `skillLinks` mapping, so it passes now; do not run the actual `skills:install` until Task 5 is done.

- [ ] **Step 5: Commit**

```bash
git add scripts/install-skills.ts test/install-skills.test.ts
git commit -m "feat(atlas): register visual-atlas in the skills installer"
```

---

## Task 4: Author `skills/shared/atlas-components.md` (controller-authored)

**Files:**
- Create: `skills/shared/atlas-components.md`

This is reference documentation, authored by the controller (not a fresh subagent — it needs the full atlas design + the generic-vocabulary mandate). Model it on `skills/shared/spec-components.md`. It must cover, all in **generic** vocabulary (D5):

- **What it is / worked reference** — point at `example/atlas-sports-rpg/` (atlas.json → atlas.html, domain-*.json → domain-*.html) as "what good looks like".
- **How it assembles** — the app shell reused verbatim; the three inlined stylesheets in order (`review.css` → `spec.css` → `atlas.css`); JSON-in / HTML-out; the block field shapes live in `src/atlas-blocks.ts`.
- **Page options** — the atlas-page (`AtlasOpts`: title/stack/count/date/note/meta) and domain-page (`DomainOpts`: title/layer/layerLabel/path/count/depends/backHref/meta) top-level options.
- **The two section ladders** — atlas page (atlas-tldr → domain-map → spine/diagram-section → domain-index) and domain page (domain-tldr → components → internal-arch diagram-section → depth → owns → seams).
- **Atlas-only component recipes** — the domain map (hand-authored SVG vs the scanner's editable architecture diagram), the tile grid (`DomainTile`: layer/layerLabel/purpose/meta/deps/href), the depth deep-dive component (files/exports/connections), the seams block (exposes/depends with neighbor links).
- **Color / role vocabulary** — the six layer tints from `LAYER_DOTS` (foundation/engine/intelligence/narrative/surface/harness) and how they map to tiles + the nested sidebar dots; cross-reference `diagrams.md` for diagram colors.
- **Cross-links** — to `diagrams.md` (compiled diagrams) and `spec-components.md` (shared card vocabulary).

**Acceptance:** referenced by name from `SKILL.md` (Task 5) and the doc test (Task 6); every atlas block type from `src/atlas-blocks.ts` appears (the doc test enforces this via the SKILL, but the catalog should also name them). Read `skills/shared/spec-components.md` and `src/atlas-blocks.ts` first; ground every recipe in the canonical.

- [ ] **Step 1: Read the models** — `skills/shared/spec-components.md`, `src/atlas-blocks.ts`, the canonical JSON, `assets/atlas.css`.
- [ ] **Step 2: Author the catalog** per the outline above, generic vocabulary throughout.
- [ ] **Step 3: Commit**

```bash
git add skills/shared/atlas-components.md
git commit -m "docs(atlas): atlas-component catalog (how it assembles, ladders, recipes, color vocab)"
```

---

## Task 5: Author `skills/visual-atlas/SKILL.md` (controller-authored)

**Files:**
- Create: `skills/visual-atlas/SKILL.md`

Controller-authored, modeled on `skills/visual-spec/SKILL.md`. Required content (generic vocabulary, D5):

- **Frontmatter** — `name: visual-atlas`; a `description` starting "Use when…" covering: produce a standing map of a codebase's domains & architecture as self-contained HTML (atlas + per-domain pages), for onboarding + reference.
- **The deliverable** — a two-level onboarding-to-reference map (atlas.html links down to domain-<slug>.html); onboarding-first; never a flat file listing.
- **The standard / definition of done** — atlas always has: atlas-tldr ('Start here'), the domain map, the domain-index of tiles (each with a purpose + link). Each domain page: domain-tldr, components, an internal-arch diagram when large, the depth deep-dive, seams. Reference depth lives in the depth components.
- **Red flags — you stopped too early** — mirror visual-spec's list, atlas-flavored (no atlas-tldr; tiles with no purpose; a domain page that is just cards with no deep-dive; no seams; the tool printed completeness warnings).
- **The three-mode workflow** — (1) full scan: `atlas --repo <abs> --out <dir>` → reconcile `atlas.domains.json` (folder first-guess if absent; drift report if present) → enrich the draft `atlas.json` + `domain-*.json` (fill purposes/detail/connections, pick diagrams, optionally upgrade the domain map to a hand-authored SVG) → render → close warnings; (2) single domain: `atlas --repo <abs> --domain <slug> --out <dir>` (regenerates that page; tile drift reported); (3) render-only: `atlas --blocks <dir>/atlas.json --out <dir>` / `atlas --all <dir> --out <dir>`.
- **The artifact set** — `atlas.domains.json` (human-owned config), `atlas.json`, `domain-<slug>.json`, and the rendered `*.html`; all committable and re-renderable.
- **Authoring pointers** — the block field shapes are in `src/atlas-blocks.ts`; the catalog is `skills/shared/atlas-components.md`; diagrams via `skills/shared/diagrams.md`. The `VISUAL_SKILLS_DIR` tool-location preamble (copy from visual-spec).
- **Scaling by repo size** — small repo (few domains): atlas + maybe 1–2 domain pages; large repo: full per-domain set, topology if useful. Floor never drops.
- **Fallbacks** — `d2` missing → placeholder; excalidraw optional; the editable domain map.
- **Example + canonical reference** — the `example/atlas-sports-rpg/` build.

**Acceptance:** Task 6's doc test passes (every atlas block type documented; frontmatter present; references `atlas-components.md` + `diagrams.md`; mandates the standard terms).

- [ ] **Step 1: Read the model** — `skills/visual-spec/SKILL.md` and the spec design doc.
- [ ] **Step 2: Author `skills/visual-atlas/SKILL.md`** per the outline; ensure every block type from `src/atlas-blocks.ts` (`atlas-tldr`, `domain-map`, `domain-index`, `domain-tldr`, `components`, `depth`, `owns`, `seams`, `diagram-section`) is named in backticks.
- [ ] **Step 3: Install + smoke-check** — run `npm run skills:install` (or `npx tsx scripts/install-skills.ts -- --dir <tmp>`) and confirm the `visual-atlas` symlink resolves to a dir with a real `SKILL.md`.
- [ ] **Step 4: Commit**

```bash
git add skills/visual-atlas/SKILL.md
git commit -m "docs(atlas): visual-atlas SKILL — standard, three-mode workflow, scaling"
```

---

## Task 6: Extend the skill-docs sync test

**Files:**
- Modify: `test/skill-docs.test.ts`

Write this test BEFORE finalizing Tasks 4/5 content (it is the docs' executable spec). If executing strictly by task number, after authoring run it and fix the docs until green.

- [ ] **Step 1: Add the atlas assertions**

In `test/skill-docs.test.ts`:

1. Read the new files at the top:

```ts
const atlasBlocks = read("../src/atlas-blocks.ts");
const atlasSkill = read("../skills/visual-atlas/SKILL.md");
const atlasBlockTypes = [...new Set([...atlasBlocks.matchAll(/\btype:\s*"([^"]+)"/g)].map((m) => m[1]))];
```

2. Add tests:

```ts
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
```

3. Add `atlasSkill` to the existing "all skills have name + description frontmatter" loop array.

- [ ] **Step 2: Run it**

Run: `npx vitest run test/skill-docs.test.ts`. If it fails, the docs (Tasks 4/5) are missing required content — fix the docs, not the test (unless an assertion is genuinely wrong). Re-run until green.

- [ ] **Step 3: Full suite + commit**

Run: `npx vitest run` (all green) and `npx tsc --noEmit` (clean).

```bash
git add test/skill-docs.test.ts
git commit -m "test(atlas): keep visual-atlas SKILL in sync with the block model + catalogs"
```

---

## Task 7: Blind dogfood (controller-run verification)

**Files:** none committed to the tool repo (output goes to a scratch dir or the dogfood subject repo).

Run the full skill, end to end, on a **different real codebase** than the canonical — ideally one of the other working dirs available, or another local TS/Prisma/tRPC repo — to surface gaps the canonical hid.

- [ ] **Step 1: Pick a subject repo** with multiple domains (a non-sports-rpg codebase). Note its path.
- [ ] **Step 2: Full scan** — `cd $VISUAL_SKILLS_DIR && npx tsx bin/atlas.ts --repo <ABS subject> --out <ABS scratch>`. Inspect `atlas.domains.json` (does the folder first-guess produce sensible domains?), the drift report, and the draft `atlas.json` + `domain-*.json`.
- [ ] **Step 3: Enrich** a representative slice — fill a few tile purposes, one domain page's component detail + seams, per the catalog — to confirm the authoring loop is smooth and the block shapes are sufficient.
- [ ] **Step 4: Render** — re-run render-only; open `atlas.html`; click through to a domain page. Confirm cross-page links resolve, diagrams render, the lint warnings are actionable and go silent as you enrich.
- [ ] **Step 5: Capture findings** — list any rough edges (bad first-guess grouping, missing block field, confusing warning, broken link). For each: decide fix-now (small, in this branch) vs. file-as-followup (note in the spec's "Open questions"). Make the small fixes with a test; commit.
- [ ] **Step 6: Commit any dogfood fixes**

```bash
git add -A
git commit -m "fix(atlas): dogfood fixes — <summary>"
```

---

## Self-review (run before dispatch)

- **Spec coverage (Phase 4 items):** lint floor (`lint-atlas.ts`, wired) ✓ Tasks 1–2; catalog ✓ Task 4; SKILL ✓ Task 5; installer registration ✓ Task 3; doc-sync tests ✓ Task 6; blind dogfood ✓ Task 7.
- **Type consistency:** `lintAtlas`/`lintDomain` take `AtlasBlock[]`, return `string[]`; wired identically to `lintSpec`. Doc test mirrors the existing spec/plan/recap assertions.
- **Generic vocabulary (D5):** the catalog, SKILL, and lint messages use generic names only; subject specifics stay in the canonical content.
- **Out of scope:** cross-file lint (tile→missing page, seam→missing neighbor) deferred to the scanner drift report / a future check (D3).
```
