# Recap "Review Shell" Port — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `visual-recap` output render in the clean app-shell "variant C" design (TL;DR + risk, derived sidebar/topbar, guided chapter/subsection walkthrough, full line-numbered diffs, clean diagrams), without changing `plan` output.

**Architecture:** A new `assembleReview()` (used only by `recap.ts`) emits the app-shell and inlines a verbatim-ported design system (`assets/review.css`) + client JS (`assets/review-viewer.js`). It reuses existing block renderers where markup matches and uses review-specific rendering for `overview` (TL;DR card), `file-tree` (sidebar list + table), and `diff` (line-numbered). Topbar + sidebar are derived from the blocks. `plan.ts`/`assemble.ts`/`template.css` are untouched.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), vitest, d2 binary, marked + sanitize-html, Shiki, playwright (excalidraw opt-in). Tests: `npm test -- <substr>`, typecheck: `npm run typecheck`.

**Spec:** `docs/superpowers/specs/2026-06-18-recap-review-shell-port-design.md`
**Canonical visual reference:** `/Users/scottrogener/Projects/ppgl/.recaps/pr-180-redesign/variant-c-color.html` (the "variant C with touches" mockup — the source of truth for every CSS/JS/structure detail). In the steps below, `MOCKUP` = this file.

**File structure:**
- Create `assets/review.css` — the full variant-C stylesheet (extracted verbatim from `MOCKUP` `<style>`).
- Create `assets/review-viewer.js` — variant-C client JS (extracted verbatim from `MOCKUP`'s two `<script>` blocks): sidebar toggle, scroll-spy, zoom overlay, open-on-hash.
- Create `src/assemble-review.ts` — `assembleReview(blocks, opts)`: app-shell + derived topbar/sidebar + section mapping.
- Modify `src/blocks.ts` — extend `OverviewBlock` (facets/risk/startHref).
- Modify `bin/recap.ts` — call `assembleReview`.
- Modify `src/render-diagram.ts` — drop `--sketch` (clean d2).
- Modify `skills/visual-recap/SKILL.md` — author TL;DR facets/risk.
- Tests under `test/`.
- UNTOUCHED: `src/assemble.ts`, `assets/template.css`, `assets/viewer.js`, `bin/plan.ts`, existing `src/renderers/*` used by plan.

**Phasing (commit per phase):** P1 shell+assets (Tasks 1–2) · P2 block model + main sections (3–6) · P3 derived chrome (7–8) · P4 diffs + diagrams (9–11) · P5 skill + guard (12–13).

---

## Phase 1 — Review shell foundation

### Task 1: Port the design-system assets (verbatim extraction)

**Files:**
- Create: `assets/review.css`
- Create: `assets/review-viewer.js`
- Test: `test/review-assets.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/review-assets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const asset = (n: string) => fileURLToPath(new URL("../assets/" + n, import.meta.url));

describe("review assets", () => {
  it("review.css carries the variant-C design system (tokens + key components)", async () => {
    const css = await readFile(asset("review.css"), "utf8");
    expect(css).toContain("--accent: #2563eb");
    expect(css).toContain("--ink-faint: #646b75");          // AA-corrected token
    expect(css).toMatch(/\.topbar\s*\{/);
    expect(css).toMatch(/\.sidebar\s*\{/);
    expect(css).toMatch(/\.tldr-card\s*\{/);
    expect(css).toMatch(/\.diff-pre\s*\{/);                 // line-numbered diff
    expect(css).toMatch(/\.chapter-no\s*\{/);               // chapter number pill
    expect(css).toContain("prefers-reduced-motion");
  });
  it("review-viewer.js carries sidebar/scroll-spy/zoom behavior", async () => {
    const js = await readFile(asset("review-viewer.js"), "utf8");
    expect(js).toContain("zoom-overlay");
    expect(js).toContain("progress-step");                  // scroll-spy on the rail
    expect(js).toContain("sidebar");
    expect(js).not.toContain("<script");                    // raw JS, not an HTML block
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- review-assets`
Expected: FAIL — assets do not exist.

- [ ] **Step 3: Extract `assets/review.css`**

Copy the CSS verbatim out of `MOCKUP` (the content BETWEEN `<style>` on line 7 and `</style>` on line 1024 — exclusive of the tags):

```bash
sed -n '8,1023p' /Users/scottrogener/Projects/ppgl/.recaps/pr-180-redesign/variant-c-color.html > assets/review.css
```

Then open `assets/review.css` and confirm it starts at `:root {` (the token block) and ends with the last rule (the craft-pass block ending in the `prefers-reduced-motion` media query). Do not edit the rules — this is the agreed design system.

- [ ] **Step 4: Extract `assets/review-viewer.js`**

`MOCKUP` has two `<script>` IIFEs: lines 1700–1831 (sidebar toggle + scroll-spy) and 1844–1866 (zoom overlay). Concatenate both (script contents only, not the `<script>` tags) into one file:

```bash
{ sed -n '1700,1831p' /Users/scottrogener/Projects/ppgl/.recaps/pr-180-redesign/variant-c-color.html;
  echo "";
  sed -n '1844,1866p' /Users/scottrogener/Projects/ppgl/.recaps/pr-180-redesign/variant-c-color.html; } > assets/review-viewer.js
```

Confirm the file contains the sidebar toggle, the scroll-spy (`progressSteps` / `updateProgress`), and the zoom overlay IIFE (`zoom-overlay`, pointer pan, wheel zoom). Leave the code as-is.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- review-assets && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add assets/review.css assets/review-viewer.js test/review-assets.test.ts
git commit -m "feat: port variant-C design system + viewer JS as review assets"
```

End every commit message with a real newline then:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
Commit to `main` (this repo's intended workflow — never create a branch).

---

### Task 2: `assembleReview` shell + wire `recap.ts`

**Files:**
- Create: `src/assemble-review.ts`
- Modify: `bin/recap.ts`
- Test: `test/assemble-review.test.ts`

Read `MOCKUP` lines 1025–1698 first to see the exact body structure to reproduce: `<header class="topbar">`, `<div class="sidebar-overlay">`, `<div class="layout"><nav class="sidebar">…</nav><main class="main">…</main></div>`, the `<div id="zoom-overlay" class="zoom-overlay">…</div>` (MOCKUP lines 1833–1842), then the inlined script. This task builds the SHELL with placeholder section content; later tasks fill real sections.

- [ ] **Step 1: Write the failing test**

Create `test/assemble-review.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assembleReview } from "../src/assemble-review.js";
import type { Block } from "../src/blocks.js";

const blocks: Block[] = [
  { type: "prose", id: "summary", title: "Summary", markdown: "Hello." },
];

describe("assembleReview", () => {
  it("emits the app-shell (topbar + sidebar + main) and exactly one inlined viewer script", async () => {
    const html = await assembleReview(blocks, { title: "Recap — x", source: "ppgl · base a → head b" });
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('class="topbar"');
    expect(html).toContain('class="sidebar"');
    expect(html).toContain('class="main"');
    expect(html).toContain("Recap — x");
    expect(html).toContain("<style>");                       // inlined review.css
    expect(html).toContain("zoom-overlay");                  // inlined review-viewer.js + markup
    expect((html.match(/<script>/g) || []).length).toBe(1);  // one inlined script
    expect(html).not.toMatch(/<script[^>]*\ssrc=/i);         // never external
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- assemble-review`
Expected: FAIL — `src/assemble-review.ts` does not exist.

- [ ] **Step 3: Implement the shell in `src/assemble-review.ts`**

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Block } from "./blocks.js";
import { escapeHtml } from "./html.js";
import { assertUniqueIds, collectDiagrams, renderAllDiagrams } from "./review/diagrams.js";

export interface ReviewStatus { level: "green" | "yellow" | "red"; text: string; }
export interface ReviewOpts {
  title: string;
  source: string;
  status?: ReviewStatus;
  outDir?: string;
  excalidraw?: boolean;
  onWarn?: (msg: string) => void;
  generator?: string;
}

const ASSETS = fileURLToPath(new URL("../assets", import.meta.url));

export async function assembleReview(blocks: Block[], opts: ReviewOpts): Promise<string> {
  assertUniqueIds(blocks);
  const css = await readFile(join(ASSETS, "review.css"), "utf8");
  const viewer = await readFile(join(ASSETS, "review-viewer.js"), "utf8");

  // Placeholder shell — real topbar/sidebar/main sections are filled by later tasks.
  const topbar = `<header class="topbar"><div class="topbar-title">${escapeHtml(opts.title)}</div></header>`;
  const sidebar = `<nav class="sidebar"></nav>`;
  const mainSections = blocks.map((b) => `<section class="section" id="${escapeHtml(b.id)}"></section>`).join("");
  const main = `<main class="main">${mainSections}</main>`;
  const zoomOverlay =
    `<div id="zoom-overlay" class="zoom-overlay" aria-hidden="true">` +
    `<div class="zoom-controls">` +
    `<button id="zoom-out" type="button" aria-label="Zoom out">&#8722;</button>` +
    `<button id="zoom-reset" type="button">Reset</button>` +
    `<button id="zoom-in" type="button" aria-label="Zoom in">+</button>` +
    `<button id="zoom-close" type="button" aria-label="Close">&#10006;</button>` +
    `</div><div id="zoom-stage" class="zoom-stage"></div></div>`;

  return (
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `${opts.generator ? `<meta name="generator" content="${escapeHtml(opts.generator)}">` : ""}` +
    `<title>${escapeHtml(opts.title)}</title><style>${css}</style></head>` +
    `<body>${topbar}<div class="sidebar-overlay" id="sidebar-overlay"></div>` +
    `<div class="layout">${sidebar}${main}</div>${zoomOverlay}` +
    `<script>${viewer}</script></body></html>\n`
  );
}
```

Create the helper module `src/review/diagrams.ts` (extracted from `assemble.ts`'s diagram collection so review and plan share it without coupling):

```ts
import type { Block, DiagramBlock, SchemaBlock } from "../blocks.js";
import { isDiagramBlock } from "../blocks.js";
import { renderAll, type DiagramResult, type RenderOpts } from "../render-diagram.js";

export function assertUniqueIds(blocks: Block[], seen = new Set<string>()): void {
  for (const b of blocks) {
    if (seen.has(b.id)) throw new Error(`duplicate block id "${b.id}" — ids must be unique`);
    seen.add(b.id);
    if (b.type === "group") assertUniqueIds(b.blocks, seen);
    else if (b.type === "tabs") assertUniqueIds(b.tabs.map((t) => t.block), seen);
    else if (b.type === "diff" && b.diagram) assertUniqueIds([b.diagram], seen);
    else if (b.type === "overview" && b.diagram) assertUniqueIds([b.diagram], seen);
  }
}

export function collectDiagrams(bs: Block[]): (DiagramBlock | SchemaBlock)[] {
  const out: (DiagramBlock | SchemaBlock)[] = [];
  for (const b of bs) {
    if (isDiagramBlock(b)) out.push(b);
    else if (b.type === "group") out.push(...collectDiagrams(b.blocks));
    else if (b.type === "tabs") out.push(...collectDiagrams(b.tabs.map((t) => t.block)));
    else if (b.type === "diff" && b.diagram) out.push(...collectDiagrams([b.diagram]));
    else if (b.type === "overview" && b.diagram) out.push(...collectDiagrams([b.diagram]));
  }
  return out;
}

export async function renderAllDiagrams(
  blocks: Block[], opts: RenderOpts,
): Promise<Map<string, DiagramResult>> {
  const rendered = await renderAll(collectDiagrams(blocks), opts);
  const map = new Map<string, DiagramResult>();
  for (const r of rendered) map.set(r.id, r);
  return map;
}
```

(The skeleton imports `renderAllDiagrams`/`collectDiagrams` for use in later tasks; if the unused-import lint complains, prefix the unused ones with `void` or only import `assertUniqueIds` now and add the others when first used in Task 6. Keep `assertUniqueIds` used here.)

- [ ] **Step 4: Wire `bin/recap.ts`**

In `bin/recap.ts`, replace the `assemble` import and call with `assembleReview`:

Change `import { assemble } from "../src/assemble.js";` to:

```ts
import { assembleReview } from "../src/assemble-review.js";
```

Change the `const html = await assemble(blocks, {...})` call to `const html = await assembleReview(blocks, {...})` (same options object). Leave `--emit-blocks`, the `blocks.json` write-back, and everything else unchanged.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- assemble-review review-assets && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Confirm plan output is untouched**

Run: `npm test -- plan-cli assemble`
Expected: PASS — `bin/plan.ts` still uses `assemble`/`template.css`; no plan changes.

- [ ] **Step 7: Commit**

```bash
git add src/assemble-review.ts src/review/diagrams.ts bin/recap.ts test/assemble-review.test.ts
git commit -m "feat: assembleReview app-shell skeleton wired into recap (plan untouched)"
```

---

## Phase 2 — Block model + main-column sections

### Task 3: Extend `OverviewBlock` + render the TL;DR card

**Files:**
- Modify: `src/blocks.ts`
- Create: `src/review/tldr.ts`
- Modify: `src/assemble-review.ts`
- Test: `test/review-tldr.test.ts`

Read `MOCKUP` for the TL;DR markup (search `class="tldr-card"`, ~lines 1060–1120): `tldr-card` > `tldr-header` (`tldr-eyebrow` "TL;DR" + `tldr-heading` "10-second read") > `tldr-rows` (each `tldr-row` = `tldr-key` + `tldr-val`, with What/Why/Risk/Size; the Risk row embeds a `chip chip-risk risk-<level>`) > `tldr-start` (`tldr-start-label` "Start here →" accent link). Reproduce those exact classes.

- [ ] **Step 1: Write the failing test**

Create `test/review-tldr.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderTldr } from "../src/review/tldr.js";
import type { OverviewBlock } from "../src/blocks.js";

const ov: OverviewBlock = {
  type: "overview", id: "overview", headline: "Add a weekly standings query",
  facets: { what: "A protected query.", why: "Foundation for past weeks.", size: "8 files, ~154 runtime lines." },
  risk: { level: "low", note: "Additive, no schema changes." },
  startHref: "#s-repo",
  points: [{ text: "new `weeklyStandings` on the [router](#s-router)" }],
};

describe("renderTldr", () => {
  it("renders the TL;DR card with facets, a level-coded risk chip, and a start link (NO points)", async () => {
    const html = await renderTldr(ov);
    expect(html).toContain('class="tldr-card"');
    expect(html).toContain("Add a weekly standings query");
    expect(html).toContain("A protected query.");
    expect(html).toMatch(/chip-risk risk-low/);
    expect(html).toContain('href="#s-repo"');           // start link
    expect(html).not.toContain("tldr-points");           // points live in the separate Overview section
  });
  it("omits facets/risk/start gracefully when absent", async () => {
    const html = await renderTldr({ type: "overview", id: "o", headline: "H", points: [] });
    expect(html).toContain("H");
    expect(html).not.toContain("chip-risk");
    expect(html).not.toContain("tldr-start");
  });
});

describe("renderOverviewPoints", () => {
  it("renders the key-fact points (keyword links) as the Overview section", async () => {
    const { renderOverviewPoints } = await import("../src/review/tldr.js");
    const html = await renderOverviewPoints(ov);
    expect(html).toContain('class="overview-list"');
    expect(html).toContain('href="#s-router"');          // keyword link in a point
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- review-tldr`
Expected: FAIL — `renderTldr` and the new fields don't exist.

- [ ] **Step 3: Extend `OverviewBlock` in `src/blocks.ts`**

Replace the `OverviewBlock` interface with:

```ts
export interface OverviewBlock {
  type: "overview";
  id: string;
  headline: string;                            // the main change, one scannable line (inline markdown)
  points: { text: string; href?: string }[];   // short key points; href = "#section-id" to its detail
  diagram?: DiagramBlock | TabsBlock;           // lead illustration
  // Review-shell TL;DR (all optional — older blocks.json still render):
  facets?: { what?: string; why?: string; size?: string };
  risk?: { level: "low" | "med" | "high"; note?: string };
  startHref?: string;
}
```

- [ ] **Step 4: Implement `src/review/tldr.ts`**

```ts
import { escapeHtml } from "../html.js";
import { renderInlineMarkdown } from "../renderers/markdown.js";
import type { OverviewBlock } from "../blocks.js";

const SAFE_HREF = /^(#[A-Za-z0-9_-]+|https?:\/\/)/;
const RISK_LABEL = { low: "LOW", med: "MED", high: "HIGH" } as const;

export async function renderTldr(b: OverviewBlock): Promise<string> {
  const headline = `<h2 class="tldr-heading">${await renderInlineMarkdown(b.headline)}</h2>`;
  const rows: string[] = [];
  const row = (k: string, vHtml: string) =>
    `<div class="tldr-row"><span class="tldr-key">${k}</span><span class="tldr-val">${vHtml}</span></div>`;
  if (b.facets?.what) rows.push(row("What", await renderInlineMarkdown(b.facets.what)));
  if (b.facets?.why) rows.push(row("Why", await renderInlineMarkdown(b.facets.why)));
  if (b.risk) {
    const chip = `<span class="chip chip-risk risk-${b.risk.level}">&#10003; ${RISK_LABEL[b.risk.level]}</span>`;
    const note = b.risk.note ? " " + await renderInlineMarkdown(b.risk.note) : "";
    rows.push(row("Risk", `${chip}${note}`));
  }
  if (b.facets?.size) rows.push(row("Size", await renderInlineMarkdown(b.facets.size)));

  const start = b.startHref && SAFE_HREF.test(b.startHref)
    ? `<div class="tldr-start"><span class="tldr-start-label">Start here</span> ` +
      `<a href="${escapeHtml(b.startHref)}">&#8594;</a></div>`
    : "";

  // The TL;DR card carries facets + risk + start ONLY. The `points` render as the separate
  // Overview section (renderOverviewPoints), matching the mockup (#tldr vs #overview).
  return (
    `<div class="tldr-card">` +
    `<div class="tldr-header"><span class="tldr-eyebrow">TL;DR</span>${headline}</div>` +
    `<div class="tldr-rows">${rows.join("")}</div>${start}</div>`
  );
}

// The "Overview" section: the key-fact points with keyword links (mockup #overview / "N key facts").
export async function renderOverviewPoints(b: OverviewBlock): Promise<string> {
  const items = await Promise.all(b.points.map(async (p) => {
    const inner = await renderInlineMarkdown(p.text);
    const body = p.href && SAFE_HREF.test(p.href) && !/<a[\s>]/i.test(inner)
      ? `${inner} <a class="overview-point-link" href="${escapeHtml(p.href)}">&#8594;</a>` : inner;
    return `<li class="overview-item">${body}</li>`;
  }));
  return `<ul class="overview-list">${items.join("")}</ul>`;
}
```

NOTE: the canonical mockup uses specific class names; if any differ (e.g. the overview list/item class), open `MOCKUP` and match the actual class names so `review.css` styles them. Adjust the strings (and the test) to the real names rather than inventing new ones.

- [ ] **Step 5: Render the TL;DR + Overview sections in `assemble-review.ts`**

In `assemble-review.ts`, import `renderTldr` and `renderOverviewPoints`. For an `overview` block, render TWO sections: `<section id="tldr" class="section">${renderTldr(b)}</section>` and `<section id="overview" class="section"><div class="section-header"><h2 class="section-title">Overview</h2></div>${renderOverviewPoints(b)}</section>`. Keep other blocks as placeholders for now.

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test -- review-tldr assemble-review && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/blocks.ts src/review/tldr.ts src/assemble-review.ts test/review-tldr.test.ts
git commit -m "feat: TL;DR card from extended overview block (facets + risk + start)"
```

---

### Task 4: Files-changed table (review)

**Files:**
- Create: `src/review/files-table.ts`
- Modify: `src/assemble-review.ts`
- Test: `test/review-files-table.test.ts`

Read `MOCKUP` for the `class="files-table"` markup (status marker, clickable path → `#diff-id`, `+/−` stat, role cell). Reproduce those classes.

- [ ] **Step 1: Write the failing test**

Create `test/review-files-table.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderFilesTable } from "../src/review/files-table.js";
import type { FileTreeBlock } from "../src/blocks.js";

const ft: FileTreeBlock = {
  type: "file-tree", id: "files", title: "Files changed",
  files: [{ path: "src/x.ts", status: "M", added: 5, deleted: 1 }],
};

describe("renderFilesTable", () => {
  it("renders a row with status, a path linked to its diff, and stats", () => {
    const html = renderFilesTable(ft, new Map([["src/x.ts", "diff-0"]]));
    expect(html).toContain('class="files-table"');
    expect(html).toContain('href="#diff-0"');
    expect(html).toContain("src/x.ts");
    expect(html).toContain("+5");
    expect(html).toContain("-1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- review-files-table`
Expected: FAIL.

- [ ] **Step 3: Implement `src/review/files-table.ts`**

```ts
import { escapeHtml } from "../html.js";
import type { FileTreeBlock } from "../blocks.js";

export function renderFilesTable(block: FileTreeBlock, pathToId: Map<string, string>): string {
  const rows = block.files.map((f) => {
    const id = pathToId.get(f.path);
    const name = id
      ? `<a class="ft-path" href="#${escapeHtml(id)}">${escapeHtml(f.path)}</a>`
      : `<span class="ft-path">${escapeHtml(f.path)}</span>`;
    const minus = f.deleted ? ` <span class="minus">-${f.deleted}</span>` : "";
    const plus = f.added ? `<span class="plus">+${f.added}</span>` : "";
    return (
      `<tr data-status="${f.status}">` +
      `<td class="ft-status">${f.status}</td>` +
      `<td>${name}</td>` +
      `<td class="ft-stat">${plus}${minus}</td></tr>`
    );
  }).join("");
  return `<table class="files-table"><tbody>${rows}</tbody></table>`;
}
```

MATCH the mockup's actual `files-table` cell classes/structure (open `MOCKUP`); adjust class names + the test to the real ones if they differ.

- [ ] **Step 4: Wire into `assemble-review.ts`**

Build a `pathToId` map (diff path → diff id; recurse groups) — reuse the `collectDiffPaths` pattern from `assemble.ts:60`. Render a `file-tree` block via `renderFilesTable(b, pathToId)` inside `<section id="files-changed" class="section">…</section>`.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- review-files-table assemble-review && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/review/files-table.ts src/assemble-review.ts test/review-files-table.test.ts
git commit -m "feat: files-changed table with diff links (review)"
```

---

### Task 5: Walkthrough — chapters & subsections (numbering + dividers)

**Files:**
- Create: `src/review/walkthrough.ts`
- Modify: `src/assemble-review.ts`
- Test: `test/review-walkthrough.test.ts`

Read `MOCKUP` walkthrough markup: `<section id="walkthrough">` > `progress-rail` (anchors per chapter) > chapters `<div id="chN" class="section">` each with a title carrying a `chapter-no` accent pill, optional group description, and subsections `<div id="s-…" class="subsection">` whose header has a `chapter-marker` (`chapter-marker-num` pill "1a"/"1b") + `subsection-title` + `subsection-path` + stat chip + `desc-list`, then the file-diff `<details>`. Numbering: group index → 1/2/3; diff index within group → a/b/c.

This task renders the chapter/subsection STRUCTURE + description; the diff BODY uses a temporary `renderDiffBody` stub that emits all hunk lines plainly (Task 9 replaces it with the line-numbered renderer). Keep diffs in a collapsed `<details class="file-diff">` with the C summary row.

- [ ] **Step 1: Write the failing test**

Create `test/review-walkthrough.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderWalkthrough } from "../src/review/walkthrough.js";
import type { Block } from "../src/blocks.js";

const blocks: Block[] = [
  { type: "group", id: "grp-core", title: "Core change", description: "The heart.",
    blocks: [
      { type: "diff", id: "diff-0", title: "x.ts", path: "src/x.ts",
        description: "Adds a thing.", hunks: [{ header: "@@ -1 +1 @@", lines: ["+a", "-b"] }] },
      { type: "diff", id: "diff-1", title: "y.ts", path: "src/y.ts",
        hunks: [{ header: "@@ -1 +1 @@", lines: ["+c"] }] },
    ] },
  { type: "group", id: "grp-tests", title: "Tests", blocks: [
      { type: "diff", id: "diff-2", title: "t.ts", path: "src/t.test.ts", hunks: [{ header: "@@", lines: ["+t"] }] },
  ] },
];

describe("renderWalkthrough", () => {
  it("numbers chapters (1/2) and subsections (1a/1b), renders group desc + a collapsed file-diff", async () => {
    const html = await renderWalkthrough(blocks);
    expect(html).toContain('id="grp-core"');
    expect(html).toContain('class="chapter-no"');           // chapter number pill
    expect(html).toContain(">1<");                          // chapter 1
    expect(html).toContain(">1a<");                         // first subsection
    expect(html).toContain(">1b<");                         // second subsection
    expect(html).toContain(">2<");                          // chapter 2 (Tests)
    expect(html).toContain("The heart.");                   // group description
    expect(html).toContain('class="file-diff"');
    expect(html).toContain("Adds a thing.");                // diff description
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);      // diffs collapsed
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- review-walkthrough`
Expected: FAIL.

- [ ] **Step 3: Implement `src/review/walkthrough.ts`**

```ts
import { escapeHtml } from "../html.js";
import { renderMarkdown } from "../renderers/markdown.js";
import type { Block, DiffBlock, DiffHunk, GroupBlock } from "../blocks.js";

function countChanges(hunks: DiffHunk[]): { added: number; deleted: number } {
  let added = 0, deleted = 0;
  for (const h of hunks) for (const l of h.lines) {
    if (l.startsWith("+")) added++; else if (l.startsWith("-")) deleted++;
  }
  return { added, deleted };
}

// TEMPORARY plain diff body — Task 9 replaces this with the line-numbered renderer.
function renderDiffBody(d: DiffBlock): string {
  const rows = d.hunks.flatMap((h) => [h.header, ...h.lines]).map((l) => escapeHtml(l)).join("\n");
  return `<div class="diff-code"><pre class="diff-pre">${rows}</pre></div>`;
}

async function renderSubsection(d: DiffBlock, marker: string, onWarn?: (m: string) => void): Promise<string> {
  const { added, deleted } = countChanges(d.hunks);
  const desc = d.description
    ? `<ul class="desc-list"><li>${await renderMarkdown(d.description, onWarn)}</li></ul>` : "";
  const minus = deleted ? ` <span class="minus">-${deleted}</span>` : "";
  return (
    `<div id="${escapeHtml(d.id)}" class="subsection">` +
    `<div class="subsection-header">` +
    `<span class="chapter-marker-num">${escapeHtml(marker)}</span>` +
    `<div><h4 class="subsection-title">${escapeHtml(d.title)}</h4>` +
    `<div class="subsection-path">${escapeHtml(d.path)}</div></div>` +
    `<span class="chip chip-stat"><span class="plus">+${added}</span>${minus}</span></div>` +
    desc +
    `<details class="file-diff"><summary>` +
    `<span class="diff-path">${escapeHtml(d.path)}</span>` +
    `<span class="diff-counts"><span class="plus">+${added}</span>${minus}</span></summary>` +
    renderDiffBody(d) + `</details></div>`
  );
}

async function renderChapter(g: GroupBlock, n: number, onWarn?: (m: string) => void): Promise<string> {
  const desc = g.description ? `<div class="chapter-desc">${await renderMarkdown(g.description, onWarn)}</div>` : "";
  let letterIdx = 0;
  const subs: string[] = [];
  for (const child of g.blocks) {
    if (child.type === "diff") {
      const marker = `${n}${String.fromCharCode(97 + letterIdx++)}`; // 1a, 1b, …
      subs.push(await renderSubsection(child, marker, onWarn));
    }
  }
  return (
    `<div id="${escapeHtml(g.id)}" class="section">` +
    `<h3 class="subsection-title chapter-title"><span class="chapter-no">${n}</span>${escapeHtml(g.title)}</h3>` +
    desc + subs.join("") + `</div>`
  );
}

export async function renderWalkthrough(blocks: Block[], onWarn?: (m: string) => void): Promise<string> {
  const groups = blocks.filter((b): b is GroupBlock => b.type === "group");
  const chapters = await Promise.all(groups.map((g, i) => renderChapter(g, i + 1, onWarn)));
  return chapters.join("");
}
```

MATCH the mockup's exact chapter/subsection classes and the title structure (the mockup wraps the title text so `display:flex` aligns the pill). Open `MOCKUP` and reproduce the real structure; adjust strings + the test's class assertions to the real names.

- [ ] **Step 4: Wire into `assemble-review.ts`**

Render the walkthrough via `renderWalkthrough(blocks, opts.onWarn)` inside `<section id="walkthrough" class="section">` (after a `<div class="section-header"><h2 class="section-title">Guided walkthrough</h2></div>` and the `progress-rail` — the rail is built in Task 8). For now emit the chapters; the rail comes with sidebar derivation.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- review-walkthrough assemble-review && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/review/walkthrough.ts src/assemble-review.ts test/review-walkthrough.test.ts
git commit -m "feat: walkthrough chapters + subsections with numbering (review)"
```

---

### Task 6: Diagram card, API, and reused blocks

**Files:**
- Create: `src/review/sections.ts`
- Modify: `src/assemble-review.ts`
- Test: `test/review-sections.test.ts`

Read `MOCKUP` for the diagram card (`section id="diagrams"` > `diagram-wrap` > `diagram-title` + `diagram-box` with the `diagram-enlarge` button + the SVG; `diagram-caption`). The API section reuses the existing `renderApi`. `prose`/`questions`/`annotated-code` reuse their existing renderers.

- [ ] **Step 1: Write the failing test**

Create `test/review-sections.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assembleReview } from "../src/assemble-review.js";
import type { Block } from "../src/blocks.js";

describe("review sections", () => {
  it("renders a diagram in the zoomable card and an api block", async () => {
    const blocks: Block[] = [
      { type: "diagram", id: "d", title: "Flow", kind: "flowchart", d2: "a -> b" },
      { type: "api", id: "api", title: "tRPC", procedures: [
        { name: "x.do", auth: "protected", kind: "query", input: "z.object({})", change: "added" }] },
    ];
    const html = await assembleReview(blocks, { title: "T", source: "s" });
    expect(html).toContain('class="diagram-box"');
    expect(html).toContain("diagram-enlarge");      // click-to-enlarge affordance
    expect(html).toContain("<svg");                 // d2 rendered
    expect(html).toContain("x.do");                 // api block rendered
  }, 30_000);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- review-sections`
Expected: FAIL.

- [ ] **Step 3: Implement `src/review/sections.ts`**

```ts
import { basename } from "node:path";
import { escapeHtml } from "../html.js";
import { renderApi } from "../renderers/api.js";
import { renderProse } from "../renderers/prose.js";
import { renderQuestions } from "../renderers/questions.js";
import { renderAnnotatedCode } from "../renderers/annotated-code.js";
import { renderLegend } from "../renderers/legend.js";
import { rolesInSource } from "../diagram-colors.js";
import type { Block, DiagramBlock, SchemaBlock } from "../blocks.js";
import type { DiagramResult } from "../render-diagram.js";

const ENLARGE = `<button class="diagram-enlarge" type="button" aria-label="Enlarge diagram">&#x2922; Enlarge</button>`;

export function renderDiagramCard(b: DiagramBlock | SchemaBlock, r: DiagramResult): string {
  const legend = renderLegend(rolesInSource(b.d2, "mermaid" in b ? b.mermaid : undefined));
  const link = r.editable
    ? `<div class="vs-edit"><a href="${escapeHtml(basename(r.editable))}">open in Excalidraw</a></div>` : "";
  return (
    `<div class="diagram-wrap"><p class="diagram-title">${escapeHtml(b.title)}</p>` +
    `<div class="diagram-box">${ENLARGE}${r.svg}</div>${legend}${link}</div>`
  );
}

export async function renderReusedBlock(b: Block, onWarn?: (m: string) => void): Promise<string> {
  switch (b.type) {
    case "api": return renderApi(b);
    case "prose": return await renderProse(b, onWarn);
    case "questions": return renderQuestions(b);
    case "annotated-code": return await renderAnnotatedCode(b, onWarn);
    default: return "";
  }
}
```

- [ ] **Step 4: Wire into `assemble-review.ts`**

Use `renderAllDiagrams` (from `src/review/diagrams.ts`) up front to get a `Map<id, DiagramResult>`. In the main loop: `diagram`/`schema` → wrap `renderDiagramCard` in `<section id="diagrams" class="section">` (group consecutive diagrams under one section header "Data model & request flow" to match the mockup, or one card per diagram — match `MOCKUP`); `api`/`prose`/`questions`/`annotated-code` → `renderReusedBlock` wrapped in `<section class="section" id="…">`.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- review-sections assemble-review && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/review/sections.ts src/assemble-review.ts test/review-sections.test.ts
git commit -m "feat: diagram card + API/prose/questions sections (review)"
```

---

## Phase 3 — Derived chrome (topbar + sidebar)

### Task 7: Topbar derivation

**Files:**
- Create: `src/review/topbar.ts`
- Modify: `src/assemble-review.ts`
- Test: `test/review-topbar.test.ts`

Read `MOCKUP` topbar (`class="topbar"`): title, `chip chip-risk risk-<level>`, `chip chip-stat` (`+x/−y`, `N files`), `chip chip-pr` (scope tag), `topbar-meta` (source).

- [ ] **Step 1: Write the failing test**

Create `test/review-topbar.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderTopbar } from "../src/review/topbar.js";
import type { Block } from "../src/blocks.js";

const blocks: Block[] = [
  { type: "overview", id: "overview", headline: "H", points: [], risk: { level: "med" } },
  { type: "file-tree", id: "files", title: "Files changed",
    files: [{ path: "a.ts", status: "M", added: 5, deleted: 2 }, { path: "b.ts", status: "A", added: 3, deleted: 0 }] },
];

describe("renderTopbar", () => {
  it("derives title, risk chip by level, +/- stat, and file count from blocks", () => {
    const html = renderTopbar(blocks, { title: "Weekly standings", source: "ppgl · base a → head b" });
    expect(html).toContain("Weekly standings");
    expect(html).toMatch(/chip-risk risk-med/);
    expect(html).toContain("+8");      // 5+3
    expect(html).toContain("-2");
    expect(html).toContain("2 files");
    expect(html).toContain("ppgl · base a → head b");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- review-topbar`
Expected: FAIL.

- [ ] **Step 3: Implement `src/review/topbar.ts`**

```ts
import { escapeHtml } from "../html.js";
import type { Block, FileTreeBlock, OverviewBlock } from "../blocks.js";
import type { ReviewOpts } from "../assemble-review.js";

const RISK_LABEL = { low: "LOW", med: "MED", high: "HIGH" } as const;

export function renderTopbar(blocks: Block[], opts: ReviewOpts): string {
  const ov = blocks.find((b): b is OverviewBlock => b.type === "overview");
  const ft = blocks.find((b): b is FileTreeBlock => b.type === "file-tree");
  const chips: string[] = [];
  if (ov?.risk) {
    chips.push(`<span class="chip chip-risk risk-${ov.risk.level}">&#10003; Risk: ${RISK_LABEL[ov.risk.level]}</span>`);
  }
  if (ft) {
    const added = ft.files.reduce((a, f) => a + f.added, 0);
    const deleted = ft.files.reduce((a, f) => a + f.deleted, 0);
    chips.push(
      `<span class="chip chip-stat"><span class="plus">+${added}</span>` +
      (deleted ? ` <span class="minus">-${deleted}</span>` : "") + `</span>`,
      `<span class="chip chip-stat">${ft.files.length} files</span>`,
    );
  }
  return (
    `<header class="topbar"><div class="topbar-title">${escapeHtml(opts.title)}</div>` +
    chips.join("") +
    `<div class="topbar-meta">${escapeHtml(opts.source)}</div></header>`
  );
}
```

MATCH the mockup's topbar class names/structure (open `MOCKUP`); adjust to the real ones.

- [ ] **Step 4: Wire into `assemble-review.ts`**

Replace the placeholder `topbar` with `renderTopbar(blocks, opts)`.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- review-topbar assemble-review && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/review/topbar.ts src/assemble-review.ts test/review-topbar.test.ts
git commit -m "feat: derived topbar (risk chip + stats) for review"
```

---

### Task 8: Sidebar derivation + progress rail

**Files:**
- Create: `src/review/sidebar.ts`
- Modify: `src/assemble-review.ts`
- Test: `test/review-sidebar.test.ts`

Read `MOCKUP` sidebar (`class="sidebar"`): three `sidebar-section`s — FILES CHANGED (`file-list` with `file-item` status + name link + stat), WALKTHROUGH (`outline-list` with `outline-item` anchors, numbered, scroll-spy via `is-active`), META. Also the `progress-rail` (`progress-step` anchors per chapter) lives at the top of the walkthrough section. The scroll-spy JS keys off `.outline-item` and `.progress-step` (see `review-viewer.js`) — emit those exact classes + `href="#id"`.

- [ ] **Step 1: Write the failing test**

Create `test/review-sidebar.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderSidebar, renderProgressRail } from "../src/review/sidebar.js";
import type { Block } from "../src/blocks.js";

const blocks: Block[] = [
  { type: "overview", id: "overview", headline: "H", points: [] },
  { type: "file-tree", id: "files", title: "Files changed",
    files: [{ path: "src/x.ts", status: "M", added: 1, deleted: 0 }] },
  { type: "group", id: "grp-core", title: "Core change", blocks: [
    { type: "diff", id: "diff-0", title: "x.ts", path: "src/x.ts", hunks: [{ header: "@@", lines: ["+a"] }] }] },
  { type: "group", id: "grp-tests", title: "Tests", blocks: [
    { type: "diff", id: "diff-1", title: "t.ts", path: "t.ts", hunks: [{ header: "@@", lines: ["+t"] }] }] },
];

describe("review sidebar", () => {
  it("derives files list + numbered outline with anchors", () => {
    const html = renderSidebar(blocks, new Map([["src/x.ts", "diff-0"]]),
      { title: "T", source: "ppgl · base a → head b" });
    expect(html).toContain('href="#diff-0"');        // file links to its diff
    expect(html).toContain('href="#grp-core"');       // outline chapter anchor
    expect(html).toContain('href="#grp-tests"');
    expect(html).toContain("Core change");
    expect(html).toContain("base a → head b");        // meta
  });
  it("progress rail has one anchored step per chapter", () => {
    const rail = renderProgressRail(blocks);
    expect((rail.match(/class="progress-step/g) || []).length).toBe(2);
    expect(rail).toContain('href="#grp-core"');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- review-sidebar`
Expected: FAIL.

- [ ] **Step 3: Implement `src/review/sidebar.ts`**

```ts
import { escapeHtml } from "../html.js";
import type { Block, FileTreeBlock, GroupBlock, OverviewBlock } from "../blocks.js";
import type { ReviewOpts } from "../assemble-review.js";

function chapters(blocks: Block[]): GroupBlock[] {
  return blocks.filter((b): b is GroupBlock => b.type === "group");
}

export function renderProgressRail(blocks: Block[]): string {
  const steps = chapters(blocks).map((g, i) =>
    `<a class="progress-step${i === 0 ? " is-active" : ""}" href="#${escapeHtml(g.id)}">` +
    `<div class="progress-step-num" aria-hidden="true">${i + 1}</div>` +
    `<span class="progress-step-label">${escapeHtml(g.title)}</span></a>`).join("");
  return `<nav class="progress-rail" aria-label="Jump to walkthrough chapter">${steps}</nav>`;
}

export function renderSidebar(blocks: Block[], pathToId: Map<string, string>, opts: ReviewOpts): string {
  const ft = blocks.find((b): b is FileTreeBlock => b.type === "file-tree");
  const ov = blocks.find((b): b is OverviewBlock => b.type === "overview");

  const files = ft ? ft.files.map((f) => {
    const id = pathToId.get(f.path);
    const name = escapeHtml(f.path.split("/").slice(-2).join("/"));
    const label = id ? `<a class="file-item" href="#${escapeHtml(id)}">` : `<span class="file-item">`;
    const close = id ? "</a>" : "</span>";
    const minus = f.deleted ? ` <span class="minus">-${f.deleted}</span>` : "";
    return `${label}<span class="file-status" data-status="${f.status}">${f.status}</span>` +
      `<span class="file-name">${name}</span>` +
      `<span class="file-stat"><span class="plus">+${f.added}</span>${minus}</span>${close}`;
  }).join("") : "";
  const filesSection = ft
    ? `<div class="sidebar-section"><span class="sidebar-label">Files changed (${ft.files.length})</span>` +
      `<div class="file-list">${files}</div></div>` : "";

  const outlineItems: string[] = [];
  if (ov) outlineItems.push(`<a class="outline-item" href="#tldr">TL;DR</a>`);
  if (ov) outlineItems.push(`<a class="outline-item" href="#overview">Overview</a>`);
  chapters(blocks).forEach((g, i) => {
    outlineItems.push(`<a class="outline-item" href="#${escapeHtml(g.id)}"><span class="outline-num">${i + 1}</span> ${escapeHtml(g.title)}</a>`);
    let li = 0;
    for (const c of g.blocks) {
      if (c.type === "diff") {
        const marker = `${i + 1}${String.fromCharCode(97 + li++)}`;
        outlineItems.push(`<a class="outline-item outline-sub" href="#${escapeHtml(c.id)}"><span class="outline-num">${marker}</span> ${escapeHtml(c.title)}</a>`);
      }
    }
  });
  const outline = `<div class="sidebar-section"><span class="sidebar-label">Walkthrough</span>` +
    `<div class="outline-list">${outlineItems.join("")}</div></div>`;

  const meta = `<div class="sidebar-section"><span class="sidebar-label">Meta</span>` +
    `<div class="sidebar-meta">${escapeHtml(opts.source)}</div></div>`;

  return `<nav class="sidebar" id="sidebar">${filesSection}${outline}${meta}</nav>`;
}
```

MATCH the mockup's sidebar/outline/progress-rail class names exactly (the scroll-spy JS depends on `.outline-item` and `.progress-step`). Open `MOCKUP` and `review-viewer.js`; adjust class names + the test if the real ones differ.

- [ ] **Step 4: Wire into `assemble-review.ts`**

Replace the placeholder `sidebar` with `renderSidebar(blocks, pathToId, opts)`. Add a sidebar-toggle button to the topbar (match `MOCKUP`: `<button id="sidebar-toggle" …>`), and emit `renderProgressRail(blocks)` at the top of the walkthrough section.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- review-sidebar assemble-review && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/review/sidebar.ts src/assemble-review.ts test/review-sidebar.test.ts
git commit -m "feat: derived sidebar (files + outline) + progress rail (review)"
```

---

## Phase 4 — Diffs + diagrams

### Task 9: Line-numbered diff rendering

**Files:**
- Create: `src/review/diff.ts`
- Modify: `src/review/walkthrough.ts`
- Test: `test/review-diff.test.ts`

Replace Task 5's temporary `renderDiffBody` with the real line-numbered renderer matching the mockup (`.diff-pre` flex rows: `.dn` old, `.dn` new, `.dg` gutter, `.dc` code; `dl-add/dl-del/dl-ctx/dl-hunk`).

- [ ] **Step 1: Write the failing test**

Create `test/review-diff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderDiffBody } from "../src/review/diff.js";
import type { DiffBlock } from "../src/blocks.js";

const d: DiffBlock = {
  type: "diff", id: "diff-0", title: "x.ts", path: "src/x.ts",
  hunks: [{ header: "@@ -10,3 +10,4 @@ ctx", lines: [" a", "+b", "-c", " d"] }],
};

describe("renderDiffBody", () => {
  it("renders old/new line numbers, +/- gutters, and the full diff (no truncation)", () => {
    const html = renderDiffBody(d);
    expect(html).toContain('class="diff-pre"');
    expect(html).toContain('class="dl dl-add"');
    expect(html).toContain('class="dl dl-del"');
    expect(html).toContain('class="dl dl-ctx"');
    expect(html).toContain('class="dl dl-hunk"');
    // context line " a" → old 10 / new 10
    expect(html).toMatch(/<span class="dn">10<\/span><span class="dn">10<\/span>/);
    // added line "+b" → blank old, new 11
    expect(html).toMatch(/<span class="dn"><\/span><span class="dn">11<\/span>/);
    expect(html).not.toContain("more lines");          // never truncates
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- review-diff`
Expected: FAIL.

- [ ] **Step 3: Implement `src/review/diff.ts`**

```ts
import { escapeHtml } from "../html.js";
import type { DiffBlock, DiffHunk } from "../blocks.js";

interface Row { t: "h" | "+" | "-" | " "; text: string; }

function rows(hunks: DiffHunk[]): Row[] {
  const out: Row[] = [];
  for (const h of hunks) {
    out.push({ t: "h", text: h.header });
    for (const l of h.lines) {
      const t = l[0] === "+" ? "+" : l[0] === "-" ? "-" : " ";
      out.push({ t, text: l.slice(1) });
    }
  }
  return out;
}

export function renderDiffBody(d: DiffBlock): string {
  let oldNo = 0, newNo = 0;
  const html = rows(d.hunks).map((l) => {
    if (l.t === "h") {
      const m = l.text.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) { oldNo = +m[1]; newNo = +m[2]; }
      return `<span class="dl dl-hunk"><span class="dn"></span><span class="dn"></span><span class="dg"></span><span class="dc">${escapeHtml(l.text)}</span></span>`;
    }
    let o = "", n = "";
    if (l.t === "+") n = String(newNo++);
    else if (l.t === "-") o = String(oldNo++);
    else { o = String(oldNo++); n = String(newNo++); }
    const cls = l.t === "+" ? "dl-add" : l.t === "-" ? "dl-del" : "dl-ctx";
    const g = l.t === " " ? "" : l.t;
    return `<span class="dl ${cls}"><span class="dn">${o}</span><span class="dn">${n}</span><span class="dg">${g}</span><span class="dc">${escapeHtml(l.text) || " "}</span></span>`;
  }).join("");
  return `<div class="diff-code"><div class="diff-pre">${html}</div></div>`;
}
```

- [ ] **Step 4: Use it in `src/review/walkthrough.ts`**

Delete the temporary `renderDiffBody` from `walkthrough.ts` and import the real one: `import { renderDiffBody } from "./diff.js";`.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- review-diff review-walkthrough && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/review/diff.ts src/review/walkthrough.ts test/review-diff.test.ts
git commit -m "feat: line-numbered diff rendering (review)"
```

---

### Task 10: Full-diff capture guard test

**Files:**
- Test: `test/review-full-diff.test.ts`

Locks in that gather → assembleReview shows the complete diff (no truncation). Uses the in-repo git history (`HEAD`/`HEAD^`) so it has no external dependency.

- [ ] **Step 1: Write the test**

Create `test/review-full-diff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildBlocks } from "../src/gather-recap.js";
import { assembleReview } from "../src/assemble-review.js";
import { resolveScope, changedFiles } from "../src/git.js";
import { GenericAdapter } from "../src/adapters/generic.js";

describe("review full-diff capture", () => {
  it("renders the complete diff for a real commit (no per-file truncation)", async () => {
    const scope = await resolveScope({ kind: "commit", ref: "HEAD" }, { repoRoot: "." });
    const files = await changedFiles(scope.baseRef, scope.headRef, ".");
    const blocks = await buildBlocks(scope, files, new GenericAdapter());
    const html = await assembleReview(blocks, { title: "T", source: "x" });
    expect(html).not.toContain("more lines");
    expect(html).not.toMatch(/view the (full )?diff in the PR/i);
    // every gathered diff line count is reflected: assert total +/- rows >= gathered changed lines
    let changed = 0;
    const walk = (b: any) => {
      if (Array.isArray(b)) return b.forEach(walk);
      if (b && b.type === "diff") changed += b.hunks.flatMap((h: any) => h.lines).filter((l: string) => l[0] === "+" || l[0] === "-").length;
      if (b && b.blocks) walk(b.blocks);
    };
    walk(blocks);
    const rendered = (html.match(/class="dl dl-(add|del)"/g) || []).length;
    expect(rendered).toBe(changed);
  }, 30_000);
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `npm test -- review-full-diff`
Expected: PASS (gather already captures full diffs; this guards it).

- [ ] **Step 3: Commit**

```bash
git add test/review-full-diff.test.ts
git commit -m "test: guard full-diff capture through gather + review render"
```

---

### Task 11: Clean d2 diagrams (drop --sketch)

**Files:**
- Modify: `src/render-diagram.ts`
- Test: `test/render-diagram.test.ts` (or a new assertion)

- [ ] **Step 1: Write the failing test**

Add to `test/render-diagram.test.ts` (or create `test/clean-d2.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { renderDiagram } from "../src/render-diagram.js";
import type { DiagramBlock } from "../src/blocks.js";

describe("clean d2", () => {
  it("renders without the hand-drawn sketch filter", async () => {
    const block: DiagramBlock = { type: "diagram", id: "d", title: "D", kind: "flowchart", d2: "a -> b" };
    const out = await renderDiagram(block, { excalidraw: false });
    expect(out.svg).toMatch(/<svg/);
    // d2 --sketch injects a roughjs turbulence filter; clean mode must not contain it
    expect(out.svg).not.toMatch(/feTurbulence|sketch/i);
  }, 30_000);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- clean-d2`
Expected: FAIL — current output uses `--sketch` (contains a turbulence filter).

- [ ] **Step 3: Drop `--sketch` in `src/render-diagram.ts`**

In `renderViaD2`, change the d2 invocation from:

```ts
    await exec("d2", ["--sketch", "--theme", "0", "--pad", "24", inFile, outFile]);
```

to:

```ts
    // Clean (non-sketch) rendering for the review aesthetic.
    await exec("d2", ["--theme", "0", "--pad", "24", inFile, outFile]);
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- clean-d2 diagram-colors render-diagram && npm run typecheck`
Expected: PASS. (Existing diagram tests assert `<svg` + role fills, which still hold.)

- [ ] **Step 5: Commit**

```bash
git add src/render-diagram.ts test/clean-d2.test.ts
git commit -m "feat: clean (non-sketch) d2 rendering to match the review design"
```

---

## Phase 5 — Skill guidance + final

### Task 12: Skill guidance for the TL;DR

**Files:**
- Modify: `skills/visual-recap/SKILL.md`

- [ ] **Step 1: Update the overview guidance**

In `skills/visual-recap/SKILL.md` step 3 ("Lead with a summary"), document the new TL;DR fields the agent should author on the `overview` block so the card + topbar populate. Add after the existing overview example:

```
   For the review layout, also fill the TL;DR fields on the `overview` block:
   - `facets`: `{ "what": "…one line…", "why": "…one line…", "size": "…e.g. 8 files, ~154 runtime lines…" }`
   - `risk`: `{ "level": "low" | "med" | "high", "note": "…why (e.g. additive, no schema changes)…" }`
   - `startHref`: the section a reviewer should read first, e.g. `"#diff-0"`.
   These drive the TL;DR card (What/Why/Risk/Size + Start here) and the topbar risk chip.
```

- [ ] **Step 2: Run the docs test**

Run: `npm test -- skill-docs`
Expected: PASS (no new block `type` literals; `overview` already covered).

- [ ] **Step 3: Commit**

```bash
git add skills/visual-recap/SKILL.md
git commit -m "docs: author TL;DR facets/risk in the recap skill"
```

---

### Task 13: End-to-end render + final review

**Files:** none (verification)

- [ ] **Step 1: Render a real recap end-to-end**

```bash
npx tsx bin/recap.ts --repo /Users/scottrogener/Projects/ppgl --commit 174b773 --out /tmp/review-e2e
open /tmp/review-e2e/recap.html   # macOS
```

Visually confirm against `MOCKUP`: app-shell (topbar + sidebar + main), TL;DR (will be sparse until the agent authors facets/risk — that's expected for a bare recap), files table, clean diagrams in the zoomable card, walkthrough chapters/subsections, full line-numbered diffs, working sidebar toggle + scroll-spy + zoom.

- [ ] **Step 2: Full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all green; plan tests unaffected.

- [ ] **Step 3: Dispatch a final holistic code review** across the whole implementation (assembleReview + review/* + asset extraction + diff/diagram/skill changes), verifying fidelity to `MOCKUP` and that `plan` output is untouched.

---

## Final verification checklist

- [ ] `npm test` green; `npm run typecheck` clean.
- [ ] `bin/plan.ts`, `src/assemble.ts`, `assets/template.css`, `assets/viewer.js` are unmodified (`git diff` shows no changes to them).
- [ ] A real recap renders the variant-C shell with full line-numbered diffs and clean diagrams.
- [ ] `--ink-faint: #646b75` (AA) is present in `assets/review.css`.
