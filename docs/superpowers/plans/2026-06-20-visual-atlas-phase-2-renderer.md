# Visual Atlas — Phase 2: Block Model + Assembler + CLI (render-only)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A renderer that regenerates the pinned canonical (`example/atlas-sports-rpg/atlas.html` + `domain-{brain,sim,story}.html`) from committed JSON — a typed block model, a two-page assembler, and a render-only CLI.

**Architecture:** Mirrors the established `visual-spec` pipeline (`spec-blocks.ts` → `assemble-spec.ts` → `bin/spec.ts`). A block array + page options render to a self-contained HTML page in the shared app-shell, inlining `review.css` + `spec.css` + `atlas.css` and `review-viewer.js`, reusing the d2/mermaid diagram pipeline (`renderAll`) and `withDiagramSvgClass`. Two page kinds — **atlas** and **domain** — share the shell but have distinct chrome and block sets. Scanner (Phase 3) and lint/skill/catalog (Phase 4) are out of scope.

**Tech Stack:** TypeScript (ESM, `tsx`), `vitest`, the `d2` binary, the repo's existing `src/render-diagram.ts`, `src/review/sections.ts`, `src/renderers/markdown.ts`, `src/html.ts`.

**Naming rule (carry through every task):** the block types and section names are GENERIC, never subject-specific — `spine`, `domain-map`, `domain-index`, `components`, `depth`, `owns`, `seams`. Only authored content is subject-specific. (See memory `atlas-generic-vocabulary`.)

---

## Before you start

Read these for the exact patterns to copy:
- `src/spec-blocks.ts` — block-model + helper conventions (`assertUniqueSpecIds`, `collectSpecDiagrams`, `chapterLabel`, `isChapter`).
- `src/assemble-spec.ts` — shell (`renderTopbar`/`renderSidebar`/`renderRail`), per-block renderers, the rail-after-tldr placement, the doctype/zoom/inlining tail.
- `bin/spec.ts` — the `--blocks <file> --out <dir>` CLI shape.
- `src/review/sections.ts` — `withDiagramSvgClass` (exported) injects `class="diagram-svg"` into a d2 root `<svg>`.
- `example/atlas-sports-rpg/*.html` — the **output oracle**. Every renderer must reproduce these pages' markup (classes, structure). Open them and the screenshots while implementing.

Run a single test with: `npx vitest run test/<file>.test.ts -t "<name>"`. Typecheck with `npx tsc --noEmit`. Commit messages end with the repo's `Co-Authored-By` trailer.

**Work on a feature branch:** `git checkout -b feat/visual-atlas-phase2`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/atlas-blocks.ts` (create) | The block model: all `AtlasBlock` type defs + helpers (`assertUniqueAtlasIds`, `collectAtlasDiagrams`, `atlasDiagramToBlock`, `isAtlasChapter`, `atlasChapterLabel`, `LAYER_DOTS`). |
| `src/assemble-atlas.ts` (create) | `assembleAtlas(blocks, opts)` + `assembleDomain(blocks, opts)`, the shared shell helpers, and every per-block renderer. Mirrors `assemble-spec.ts`. |
| `bin/atlas.ts` (create) | Render-only CLI: `--blocks <file>` renders one page; `--all <dir>` renders `atlas.json` + every `domain-*.json` in a dir. |
| `package.json` (modify) | Add the `visual-atlas` bin and the `atlas` script. |
| `test/atlas-blocks.test.ts` (create) | Helper unit tests. |
| `test/assemble-atlas.test.ts` (create) | Atlas-page + domain-page render tests. |
| `test/atlas-cli.test.ts` (create) | CLI render-only + `--all` tests. |
| `example/atlas-sports-rpg/atlas.json` + `domain-{brain,sim,story}.json` (create) | The canonical's source-of-truth JSON; the HTML is regenerated from it. |

Keep `assemble-atlas.ts` cohesive like `assemble-spec.ts`; if it exceeds ~700 lines a later split into `src/atlas/shell.ts` is reasonable, but do not pre-split in Phase 2.

---

## The block model (the contract)

This is implemented in Task 1. Reproduced here so later tasks can reference exact field names.

```ts
import type { DiagramBlock, DiagramKind } from "./blocks.js";

/** A hand-authored legend row (color is a secondary signal; the label carries meaning). */
export interface LegendItem { label: string; fill: string; stroke: string; }

/** A rendered d2/mermaid diagram inside a section. No title is shown above it — the section
 *  header gives context (unlike the recap's renderDiagramCard which prints a title). */
export interface AtlasDiagram {
  id: string; kind: DiagramKind; d2: string; mermaid?: string;
  legend?: LegendItem[]; caption?: string;     // caption is inline markdown
}

// ---------- atlas-page blocks ----------
export interface AtlasTldrBlock {
  type: "atlas-tldr"; id: string;              // "tldr"
  eyebrow?: string;                            // default "Start here"
  heading: string;                             // inline md
  rows: { key: string; value: string }[];      // value inline md
  primer?: { h: string; p: string }[];         // the numbered "things to hold in your head"
}
export interface DomainMapBlock {
  type: "domain-map"; id: string;              // "map"
  title?: string; badge?: string; intro?: string;
  svg: string;                                 // raw trusted hand-authored SVG
  legend?: LegendItem[]; caption?: string;
}
export interface DomainTile {
  name: string; path: string;
  layer: "foundation" | "engine" | "intelligence" | "narrative" | "surface" | "harness";
  layerLabel: string;                          // "Intelligence"
  purpose: string;                             // inline md
  meta?: { key?: string; value: string }[];    // size / key types — value inline md
  deps?: string[];
  href?: string;                               // present → linked tile; absent → "Page pending"
}
export interface DomainIndexBlock {
  type: "domain-index"; id: string;            // "domains"
  title: string; badge?: string; intro?: string;
  tiles: DomainTile[];
}

// ---------- domain-page blocks ----------
export interface DomainTldrBlock {
  type: "domain-tldr"; id: string;             // "tldr"
  eyebrow?: string;                            // default "Domain"
  heading: string; rows: { key: string; value: string }[];
  bigIdea?: { label?: string; line: string; sub?: string };
}
export interface ComponentCard {
  name: string; purpose: string;               // purpose inline md
  exports?: { name: string; deputy?: boolean }[];
  exportsLabel?: string;                        // default "exports" (or "covers")
  href: string;                                 // "#c-gm"
}
export interface ComponentsBlock {
  type: "components"; id: string;              // "components"
  title: string; badge?: string; intro?: string;
  cards: ComponentCard[];
}
export interface ConnItem { dir: string; body: string; }   // body inline md
export interface KV { name: string; desc: string; }        // name mono; desc inline md
export interface ComponentDeep {
  id: string;                                  // "c-gm" (anchor for its card)
  name: string; path: string;
  detail: string[];                            // paragraphs (block markdown)
  diagrams?: AtlasDiagram[];                    // 0..n
  codeHtml?: string;                           // raw trusted code block (review.css token spans)
  files?: KV[];                                // "Key files"
  exports?: KV[];                              // "Key exports"
  connections?: ConnItem[];
}
export interface DepthBlock {
  type: "depth"; id: string;                   // "depth"
  title: string; badge?: string; intro?: string;
  components: ComponentDeep[];
}
export interface OwnsBlock {
  type: "owns"; id: string;                    // "data"
  title: string; intro?: string; rows: KV[]; note?: string;   // note inline md
}
export interface SeamsBlock {
  type: "seams"; id: string;                   // "seams"
  title: string; intro?: string;
  exposes: { api: string; note?: string }[];
  depends: { name: string; path: string; href?: string }[];   // href absent → flat (no page)
  note?: string;                               // note inline md
}
/** A standalone rendered-diagram section: the atlas "spine" and a domain page's internal-arch. */
export interface DiagramSectionBlock {
  type: "diagram-section"; id: string;
  title?: string; badge?: string; intro?: string;
  diagram: AtlasDiagram;
  callout?: string;                            // optional callout below (inline md)
}

export type AtlasBlock =
  | AtlasTldrBlock | DomainMapBlock | DomainIndexBlock
  | DomainTldrBlock | ComponentsBlock | DepthBlock | OwnsBlock | SeamsBlock
  | DiagramSectionBlock;
```

Page options:

```ts
// atlas page
export interface AtlasOpts {
  title: string;                               // topbar title, e.g. "System Atlas · sports-rpg"
  stack?: string;                              // chip, e.g. "Next.js · TypeScript"
  count?: string;                              // chip, e.g. "7 domains"
  date?: string;                               // chip, e.g. "generated 2026-06-20"
  note?: string;                               // chip, e.g. "in-memory state"
  meta?: { key: string; value: string }[];     // sidebar Meta
  outDir?: string; excalidraw?: boolean; onWarn?: (m: string) => void; generator?: string;
}
// domain page
export interface DomainOpts {
  title: string;                               // the domain name, e.g. "brain"
  layer: DomainTile["layer"]; layerLabel: string;
  path?: string; count?: string; depends?: string; date?: string;
  backHref?: string;                           // default "atlas.html"
  meta?: { key: string; value: string }[];
  outDir?: string; excalidraw?: boolean; onWarn?: (m: string) => void; generator?: string;
}
```

---

## Task 1: Block model + helpers (`atlas-blocks.ts`)

**Files:**
- Create: `src/atlas-blocks.ts`
- Test: `test/atlas-blocks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/atlas-blocks.test.ts
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
  it("treats tldr as the lead (not a chapter) and others as chapters", () => {
    expect(isAtlasChapter(tldr)).toBe(false);
    expect(isAtlasChapter(arch)).toBe(true);
    expect(atlasChapterLabel(depth)).toBe("In depth");
  });
  it("maps every layer to a dot color", () => {
    for (const l of ["foundation","engine","intelligence","narrative","surface","harness"] as const)
      expect(LAYER_DOTS[l]).toMatch(/^#([0-9a-f]{6});#([0-9a-f]{6})$/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/atlas-blocks.test.ts`
Expected: FAIL — `Cannot find module '../src/atlas-blocks.js'`.

- [ ] **Step 3: Implement `src/atlas-blocks.ts`**

Paste the full **block model (the contract)** block above, then append the helpers:

```ts
/** layer → "fill;stroke" for the small dots used in tiles + the nested sidebar. */
export const LAYER_DOTS: Record<DomainTile["layer"], string> = {
  foundation:   "#e5dbff;#9775fa",
  engine:       "#d0ebff;#4dabf7",
  intelligence: "#ffd43b;#f08c00",
  narrative:    "#d3f9d8;#37b24d",
  surface:      "#eff4ff;#2563eb",
  harness:      "#f1f3f5;#adb5bd",
};

export function atlasDiagramToBlock(d: AtlasDiagram): DiagramBlock {
  return { type: "diagram", id: d.id, title: "", kind: d.kind, d2: d.d2, mermaid: d.mermaid };
}

/** Every rendered diagram across the page, in document order (diagram-section first, then
 *  each depth component's diagrams). domain-map is NOT here — it's a raw hand-authored SVG. */
export function collectAtlasDiagrams(blocks: AtlasBlock[]): DiagramBlock[] {
  const out: DiagramBlock[] = [];
  for (const b of blocks) {
    if (b.type === "diagram-section") out.push(atlasDiagramToBlock(b.diagram));
    if (b.type === "depth") for (const c of b.components) for (const d of c.diagrams ?? []) out.push(atlasDiagramToBlock(d));
  }
  return out;
}

export function assertUniqueAtlasIds(blocks: AtlasBlock[]): void {
  const seen = new Set<string>();
  const add = (id: string) => {
    if (seen.has(id)) throw new Error(`duplicate id "${id}" — block, component, and diagram ids must be unique`);
    seen.add(id);
  };
  for (const b of blocks) {
    add(b.id);
    if (b.type === "diagram-section") add(b.diagram.id);
    if (b.type === "depth") for (const c of b.components) { add(c.id); for (const d of c.diagrams ?? []) add(d.id); }
  }
}

/** tldr blocks are the lead; everything else is a numbered chapter. */
export function isAtlasChapter(b: AtlasBlock): boolean {
  return b.type !== "atlas-tldr" && b.type !== "domain-tldr";
}
export function atlasChapterLabel(b: AtlasBlock): string {
  switch (b.type) {
    case "domain-map": return b.title ?? "Domain map";
    case "domain-index": return b.title;
    case "diagram-section": return b.title ?? "Diagram";
    case "components": return b.title;
    case "depth": return b.title;
    case "owns": return b.title;
    case "seams": return b.title;
    default: return b.id;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/atlas-blocks.test.ts` → PASS. Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/atlas-blocks.ts test/atlas-blocks.test.ts
git commit -m "feat(atlas): block model + helpers for the renderer"
```

---

## Task 2: Shared shell + page skeletons (`assemble-atlas.ts`)

Build the doctype/`<head>`/inlining wrapper, the topbar for both page kinds, the zoom overlay, and minimal `assembleAtlas`/`assembleDomain` that emit a valid self-contained page (sidebar/rail/blocks come in later tasks; here they render to empty strings so the test can assert the shell).

**Files:**
- Create: `src/assemble-atlas.ts`
- Test: `test/assemble-atlas.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/assemble-atlas.test.ts
import { describe, it, expect } from "vitest";
import { assembleAtlas, assembleDomain } from "../src/assemble-atlas.js";

describe("assemble shell", () => {
  it("atlas: self-contained doc, three stylesheets, topbar chips, zoom overlay", async () => {
    const html = await assembleAtlas([], { title: "System Atlas · demo", stack: "Next.js", count: "7 domains", date: "2026-06-20", note: "in-memory state" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.trim().endsWith("</html>")).toBe(true);
    expect(html).toContain("--accent");        // review.css
    expect(html).toContain(".board-card");     // spec.css
    expect(html).toContain(".domain-tile");    // atlas.css
    expect(html).toContain('class="chip chip-stack">Next.js');
    expect(html).toContain('class="chip chip-count">7 domains');
    expect(html).toContain('id="zoom-overlay"');
    expect(html).toContain("System Atlas · demo");
  });
  it("domain: back-link + layer/path/count/depends chips", async () => {
    const html = await assembleDomain([], { title: "brain", layer: "intelligence", layerLabel: "Intelligence", path: "lib/brain", count: "~76 files", depends: "sim · world" });
    expect(html).toContain('class="topbar-back" href="atlas.html"');
    expect(html).toContain('class="chip layer-chip layer-intelligence">Intelligence');
    expect(html).toContain('class="chip chip-stat">lib/brain');
    expect(html).toContain('class="chip chip-count">~76 files');
    expect(html).toContain("depends on sim · world");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/assemble-atlas.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement the shell**

```ts
// src/assemble-atlas.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml } from "./html.js";
import { renderInlineMarkdown, renderMarkdown } from "./renderers/markdown.js";
import { renderAll, type DiagramResult } from "./render-diagram.js";
import { withDiagramSvgClass } from "./review/sections.js";
import {
  assertUniqueAtlasIds, collectAtlasDiagrams, atlasDiagramToBlock, isAtlasChapter, atlasChapterLabel,
  LAYER_DOTS, type AtlasBlock, type AtlasDiagram, type AtlasOpts, type DomainOpts,
} from "./atlas-blocks.js";

const ASSETS = fileURLToPath(new URL("../assets", import.meta.url));
const mi = (s: string) => renderInlineMarkdown(s);

const ZOOM =
  `<div id="zoom-overlay" class="zoom-overlay" aria-hidden="true"><div class="zoom-controls">` +
  `<button id="zoom-out" type="button" aria-label="Zoom out">&#8722;</button>` +
  `<button id="zoom-reset" type="button">Reset</button>` +
  `<button id="zoom-in" type="button" aria-label="Zoom in">+</button>` +
  `<button id="zoom-close" type="button" aria-label="Close">&#10006;</button>` +
  `</div><div id="zoom-stage" class="zoom-stage"></div></div>`;

const TOGGLE =
  `<button class="sidebar-toggle" id="sidebar-toggle" aria-label="Toggle navigation sidebar" aria-expanded="false">` +
  `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">` +
  `<rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="currentColor"/>` +
  `<rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="currentColor"/>` +
  `<rect x="2" y="11.5" width="12" height="1.5" rx="0.75" fill="currentColor"/></svg></button>`;

function chip(cls: string, text: string): string { return `<span class="chip ${cls}">${escapeHtml(text)}</span>`; }

function atlasTopbar(o: AtlasOpts): string {
  const chips: string[] = [];
  if (o.stack) chips.push(chip("chip-stack", o.stack));
  if (o.count) chips.push(chip("chip-count", o.count));
  if ((o.stack || o.count) && (o.date || o.note)) chips.push(`<span class="topbar-sep" aria-hidden="true"></span>`);
  if (o.date) chips.push(chip("chip-stat", o.date));
  if (o.note) chips.push(chip("chip-stat", o.note));
  return `<header class="topbar" role="banner">${TOGGLE}<span class="topbar-title">${escapeHtml(o.title)}</span>` +
    `<div class="topbar-meta">${chips.join("")}</div></header>`;
}

function domainTopbar(o: DomainOpts): string {
  const chips: string[] = [];
  chips.push(`<span class="chip layer-chip layer-${escapeHtml(o.layer)}">${escapeHtml(o.layerLabel)}</span>`);
  if (o.path) chips.push(chip("chip-stat", o.path));
  if (o.count) chips.push(chip("chip-count", o.count));
  if (o.depends) { chips.push(`<span class="topbar-sep" aria-hidden="true"></span>`); chips.push(chip("chip-stat", `depends on ${o.depends}`)); }
  return `<header class="topbar" role="banner">${TOGGLE}` +
    `<a class="topbar-back" href="${escapeHtml(o.backHref ?? "atlas.html")}"><span aria-hidden="true">&larr;</span> Atlas</a>` +
    `<span class="topbar-title">${escapeHtml(o.title)}</span><div class="topbar-meta">${chips.join("")}</div></header>`;
}

async function doc(title: string, generator: string | undefined, topbar: string, sidebar: string, main: string): Promise<string> {
  const css = await readFile(join(ASSETS, "review.css"), "utf8");
  const specCss = await readFile(join(ASSETS, "spec.css"), "utf8");
  const atlasCss = await readFile(join(ASSETS, "atlas.css"), "utf8");
  const viewer = await readFile(join(ASSETS, "review-viewer.js"), "utf8");
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `${generator ? `<meta name="generator" content="${escapeHtml(generator)}">` : ""}` +
    `<title>${escapeHtml(title)}</title><style>${css}\n${specCss}\n${atlasCss}</style></head>` +
    `<body>${topbar}<div class="sidebar-overlay" id="sidebar-overlay"></div>` +
    `<div class="layout">${sidebar}${main}</div>${ZOOM}<script>${viewer}</script></body></html>\n`;
}

export async function assembleAtlas(blocks: AtlasBlock[], opts: AtlasOpts): Promise<string> {
  assertUniqueAtlasIds(blocks);
  const main = `<main class="main"></main>`;          // blocks wired in Task 8
  return doc(opts.title, opts.generator, atlasTopbar(opts), "", main);
}

export async function assembleDomain(blocks: AtlasBlock[], opts: DomainOpts): Promise<string> {
  assertUniqueAtlasIds(blocks);
  const main = `<main class="main"></main>`;          // blocks wired in Task 14
  return doc(opts.title, opts.generator, domainTopbar(opts), "", main);
}
```

Add `AtlasOpts` and `DomainOpts` to `src/atlas-blocks.ts` (the page-options block above), and export them.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/assemble-atlas.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/assemble-atlas.ts src/atlas-blocks.ts test/assemble-atlas.test.ts
git commit -m "feat(atlas): self-contained shell + topbars for both page kinds"
```

---

## Task 3: Sidebar (nested outline + Meta + atlas Domains) and progress rail

Both pages share one CONTENTS outline. On a domain page, the `depth` chapter nests its components as sub-items. The atlas additionally gets a "Domains" block derived from the `domain-index` tiles; both pages get a "Meta" block from `opts.meta`.

**Files:**
- Modify: `src/assemble-atlas.ts`
- Test: `test/assemble-atlas.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { type AtlasBlock } from "../src/atlas-blocks.js";

const domainBlocks: AtlasBlock[] = [
  { type: "domain-tldr", id: "tldr", heading: "h", rows: [] },
  { type: "components", id: "components", title: "The pieces", cards: [] },
  { type: "diagram-section", id: "arch", title: "Architecture", diagram: { id: "d1", kind: "architecture", d2: "a -> b" } },
  { type: "depth", id: "depth", title: "In depth", components: [
    { id: "c-gm", name: "gm", path: "lib/brain/gm", detail: ["x"] },
    { id: "c-coach", name: "coach", path: "lib/brain/coach", detail: ["x"] },
  ] },
  { type: "owns", id: "data", title: "Data it owns", rows: [] },
  { type: "seams", id: "seams", title: "Seams", exposes: [], depends: [] },
];

describe("sidebar + rail", () => {
  it("nests depth components under the in-depth chapter; numbers chapters; tldr is the lead", async () => {
    const html = await assembleDomain(domainBlocks, { title: "brain", layer: "intelligence", layerLabel: "Intelligence", meta: [{ key: "Layer", value: "Intelligence" }] });
    expect(html).toContain('data-target="tldr"');
    expect(html).toContain('class="outline-num" aria-hidden="true">1</span><span>The pieces');
    expect(html).toContain('class="outline-sub"');
    expect(html).toContain('href="#c-gm" class="outline-subitem"');
    expect(html).toContain('href="#c-coach" class="outline-subitem"');
    // 5 chapters in the rail (components, arch, depth, data, seams); tldr excluded
    expect((html.match(/class="progress-step[ "]/g) || []).length).toBe(5);
    expect(html).toMatch(/sidebar-label">Meta/);
    expect(html).not.toMatch(/class="progress-step[^"]*" href="#tldr"/);
  });
  it("atlas builds a Domains block from the index tiles (linked vs pending dot)", async () => {
    const atlasBlocks: AtlasBlock[] = [
      { type: "domain-index", id: "domains", title: "The 7 domains", tiles: [
        { name: "sim", path: "lib/sim", layer: "engine", layerLabel: "Engine", purpose: "p", href: "domain-sim.html" },
        { name: "world", path: "lib/world", layer: "foundation", layerLabel: "Foundation", purpose: "p" },
      ] },
    ];
    const html = await assembleAtlas(atlasBlocks, { title: "Atlas" });
    expect(html).toContain('sidebar-label">Domains');
    expect(html).toContain('href="domain-sim.html" class="nav-domain"');
    expect(html).toContain('nd-pending">overview');   // world has no page
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/assemble-atlas.test.ts -t "sidebar"` → FAIL (sidebar is empty `""`).

- [ ] **Step 3: Implement sidebar + rail; wire into both assemblers**

Add to `src/assemble-atlas.ts`:

```ts
interface NavEntry { id: string; label: string; num: string; subs?: { id: string; label: string; dot: string }[]; }

function navEntries(blocks: AtlasBlock[], layer: DomainOpts["layer"] | null): NavEntry[] {
  let n = 0;
  return blocks.map((b) => {
    if (!isAtlasChapter(b)) return { id: b.id, label: b.type === "atlas-tldr" ? "Start here" : "What it owns", num: "—" };
    const e: NavEntry = { id: b.id, label: atlasChapterLabel(b), num: String(++n) };
    if (b.type === "depth" && layer) {
      const dot = LAYER_DOTS[layer];
      e.subs = b.components.map((c) => ({ id: c.id, label: c.name, dot }));
    }
    return e;
  });
}

function outlineHtml(entries: NavEntry[]): string {
  return entries.map((e) => {
    const num = e.num === "—" ? "&#8212;" : e.num;
    const sub = e.subs?.length
      ? `<ul class="outline-sub" role="list">${e.subs.map((s) => {
          const [fill, stroke] = s.dot.split(";");
          return `<li><a href="#${escapeHtml(s.id)}" class="outline-subitem">` +
            `<span class="os-dot" style="background:${fill};border-color:${stroke};"></span>${escapeHtml(s.label)}</a></li>`;
        }).join("")}</ul>`
      : "";
    return `<li><a href="#${escapeHtml(e.id)}" class="outline-item" data-target="${escapeHtml(e.id)}">` +
      `<span class="outline-num" aria-hidden="true">${num}</span><span>${escapeHtml(e.label)}</span></a>${sub}</li>`;
  }).join("");
}

function metaHtml(meta?: { key: string; value: string }[]): string {
  if (!meta?.length) return "";
  const rows = meta.map((m) => `<div class="meta-row"><span class="mk">${escapeHtml(m.key)}</span><span class="mv">${escapeHtml(m.value)}</span></div>`).join("");
  return `<div class="sidebar-section"><span class="sidebar-label">Meta</span><div class="meta-list">${rows}</div></div>`;
}

/** The atlas "Domains" sidebar block, derived from the domain-index tiles. */
function domainsNavHtml(blocks: AtlasBlock[]): string {
  const idx = blocks.find((b): b is Extract<AtlasBlock, { type: "domain-index" }> => b.type === "domain-index");
  if (!idx) return "";
  const items = idx.tiles.map((t) => {
    const [fill, stroke] = LAYER_DOTS[t.layer].split(";");
    const href = t.href ?? "#domains";
    const pending = t.href ? "" : `<span class="nd-pending">overview</span>`;
    return `<li><a href="${escapeHtml(href)}" class="nav-domain"><span class="nd-dot" style="background:${fill};border-color:${stroke};"></span>` +
      `<span>${escapeHtml(t.name)}</span>${pending}</a></li>`;
  }).join("");
  return `<div class="sidebar-section"><span class="sidebar-label">Domains</span><ul class="nav-domains" role="list">${items}</ul></div>`;
}

function sidebar(blocks: AtlasBlock[], opts: { meta?: { key: string; value: string }[] }, layer: DomainOpts["layer"] | null, domainsNav: boolean): string {
  const contents = `<div class="sidebar-section"><span class="sidebar-label">Contents</span>` +
    `<ul class="outline-list" role="list">${outlineHtml(navEntries(blocks, layer))}</ul></div>`;
  return `<nav class="sidebar" id="sidebar" aria-label="Document navigation">` +
    `${contents}${domainsNav ? domainsNavHtml(blocks) : ""}${metaHtml(opts.meta)}</nav>`;
}

function rail(blocks: AtlasBlock[]): string {
  const chapters = navEntries(blocks, null).filter((e) => e.num !== "—");
  if (!chapters.length) return "";
  const steps = chapters.map((e, i) =>
    `<a class="progress-step${i === 0 ? " is-active" : ""}" href="#${escapeHtml(e.id)}">` +
    `<span class="progress-step-num">${escapeHtml(e.num)}</span>` +
    `<span class="progress-step-label">${escapeHtml(e.label)}</span></a>`).join("");
  return `<div class="progress-rail" aria-label="Section progress">${steps}</div>`;
}
```

Update the two assemblers to pass the real sidebar (main still placeholder until Tasks 8/14):

```ts
export async function assembleAtlas(blocks: AtlasBlock[], opts: AtlasOpts): Promise<string> {
  assertUniqueAtlasIds(blocks);
  const main = `<main class="main"></main>`;
  return doc(opts.title, opts.generator, atlasTopbar(opts), sidebar(blocks, opts, null, true), main);
}
export async function assembleDomain(blocks: AtlasBlock[], opts: DomainOpts): Promise<string> {
  assertUniqueAtlasIds(blocks);
  const main = `<main class="main"></main>`;
  return doc(opts.title, opts.generator, domainTopbar(opts), sidebar(blocks, opts, opts.layer, false), main);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/assemble-atlas.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/assemble-atlas.ts test/assemble-atlas.test.ts
git commit -m "feat(atlas): nested-outline sidebar, derived Domains nav, progress rail"
```

---

## Task 4: Shared pieces — legend, diagram card, section header

Three small helpers every block renderer reuses: a hand-authored legend, the bare diagram card (`.diagram-box` + svg + legend + caption, NO title — distinct from `renderDiagramCard`), and a section header.

**Files:**
- Modify: `src/assemble-atlas.ts`
- Test: `test/assemble-atlas.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { renderAtlasDiagram, atlasLegend } from "../src/assemble-atlas.js";
import { renderAll } from "../src/render-diagram.js";

describe("diagram card + legend", () => {
  it("legend renders swatches with fill+stroke", () => {
    const h = atlasLegend([{ label: "Engine", fill: "#d0ebff", stroke: "#4dabf7" }]);
    expect(h).toContain("legend-swatch");
    expect(h).toContain("background:#d0ebff");
    expect(h).toContain("Engine");
  });
  it("diagram card wraps a diagram-svg in a zoomable box with a caption", async () => {
    const diag = { id: "d1", kind: "architecture" as const, d2: "a -> b", caption: "the *flow*", legend: [{ label: "x", fill: "#fff", stroke: "#000" }] };
    const map = new Map((await renderAll([{ type: "diagram", id: "d1", title: "", kind: "architecture", d2: "a -> b" }])).map((r) => [r.id, r]));
    const h = await renderAtlasDiagram(diag, map);
    expect(h).toContain('class="diagram-box"');
    expect(h).toContain('diagram-svg');          // class injected for zoom + sizing
    expect(h).toContain('class="diagram-caption"');
    expect(h).not.toContain('class="diagram-title"');   // no title above (section gives context)
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/assemble-atlas.test.ts -t "diagram card"` → FAIL (exports missing).

- [ ] **Step 3: Implement and export the helpers**

```ts
export function atlasLegend(items?: AtlasDiagram["legend"]): string {
  if (!items?.length) return "";
  const spans = items.map((i) =>
    `<span class="legend-item"><span class="legend-swatch" style="background:${i.fill};border-color:${i.stroke};"></span>${escapeHtml(i.label)}</span>`).join("");
  return `<div class="legend" aria-label="Diagram legend">${spans}</div>`;
}

const ENLARGE = `<button class="diagram-enlarge" type="button" aria-label="Enlarge diagram">&#10530; Enlarge</button>`;

/** A diagram card with NO title above it (the section header supplies context). The svg gets
 *  the diagram-svg class so the zoom overlay + sizing rule apply. domain-map uses its own path. */
export async function renderAtlasDiagram(d: AtlasDiagram, diagrams: Map<string, DiagramResult>): Promise<string> {
  const r = diagrams.get(d.id);
  const svg = r ? withDiagramSvgClass(r.svg) : "";
  const cap = d.caption ? `<p class="diagram-caption">${await mi(d.caption)}</p>` : "";
  return `<div class="diagram-box">${ENLARGE}${svg}</div>${atlasLegend(d.legend)}${cap}`;
}

function sectionHeader(title?: string, badge?: string): string {
  if (!title) return "";
  return `<div class="section-header"><h2 class="section-title">${escapeHtml(title)}</h2>` +
    `${badge ? `<span class="section-badge">${escapeHtml(badge)}</span>` : ""}</div>`;
}
```

- [ ] **Step 4: Run it to verify it passes** → PASS; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/assemble-atlas.ts test/assemble-atlas.test.ts
git commit -m "feat(atlas): shared legend + titleless diagram card + section header"
```

---

## Task 5: Atlas-page block renderers — `atlas-tldr`, `domain-map`, `domain-index`

**Files:**
- Modify: `src/assemble-atlas.ts`
- Test: `test/assemble-atlas.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
import { renderAtlasBlock } from "../src/assemble-atlas.js";

describe("atlas-page block renderers", () => {
  const empty = new Map();
  it("atlas-tldr renders the card + primer rows", async () => {
    const h = await renderAtlasBlock({ type: "atlas-tldr", id: "tldr", heading: "A `sim`", rows: [{ key: "What", value: "x" }], primer: [{ h: "No god-mode", p: "noisy **perception**" }] }, empty);
    expect(h).toContain('class="tldr-eyebrow">Start here');
    expect(h).toContain('class="tldr-key">What');
    expect(h).toContain('class="primer"');
    expect(h).toContain('class="primer-n">1');
    expect(h).toContain("No god-mode");
  });
  it("domain-map inlines the raw svg + legend + caption in a zoom box", async () => {
    const h = await renderAtlasBlock({ type: "domain-map", id: "map", title: "The domain map", badge: "layered", svg: '<svg class="diagram-svg map-svg flow-svg" viewBox="0 0 10 10"></svg>', legend: [{ label: "Engine", fill: "#d0ebff", stroke: "#4dabf7" }], caption: "x" }, empty);
    expect(h).toContain('id="map" class="section"');
    expect(h).toContain("map-svg");
    expect(h).toContain('class="diagram-box"');
    expect(h).toContain("legend-swatch");
  });
  it("domain-index renders linked + pending tiles with layer chips and deps", async () => {
    const h = await renderAtlasBlock({ type: "domain-index", id: "domains", title: "The 7 domains", tiles: [
      { name: "sim", path: "lib/sim", layer: "engine", layerLabel: "Engine", purpose: "engine", meta: [{ key: "~77", value: "files" }], deps: ["world"], href: "domain-sim.html" },
      { name: "world", path: "lib/world", layer: "foundation", layerLabel: "Foundation", purpose: "data" },
    ] }, empty);
    expect(h).toContain('a class="domain-tile is-linked" href="domain-sim.html"');
    expect(h).toContain('class="layer-chip layer-engine">Engine');
    expect(h).toContain('class="dep-chip">world');
    expect(h).toContain('class="domain-tile is-pending"');
    expect(h).toContain("Page pending");
  });
});
```

- [ ] **Step 2: Run it to verify it fails** → FAIL (`renderAtlasBlock` missing).

- [ ] **Step 3: Implement the three renderers + a `renderAtlasBlock` dispatcher stub**

```ts
async function renderAtlasTldr(b: Extract<AtlasBlock, { type: "atlas-tldr" }>): Promise<string> {
  const rows = (await Promise.all(b.rows.map(async (r) =>
    `<div class="tldr-row"><span class="tldr-key">${escapeHtml(r.key)}</span><span class="tldr-val">${await mi(r.value)}</span></div>`))).join("");
  const card = `<div class="tldr-card"><div class="tldr-header"><span class="tldr-eyebrow">${escapeHtml(b.eyebrow ?? "Start here")}</span>` +
    `<h2 class="tldr-heading">${await mi(b.heading)}</h2></div><div class="tldr-rows">${rows}</div></div>`;
  const primer = b.primer?.length
    ? `<div class="primer">${(await Promise.all(b.primer.map(async (p, i) =>
        `<div class="primer-row"><span class="primer-n">${i + 1}</span><div class="primer-body">` +
        `<div class="primer-h">${await mi(p.h)}</div><div class="primer-p">${await mi(p.p)}</div></div></div>`))).join("")}</div>`
    : "";
  return card + primer;
}

async function renderDomainMap(b: Extract<AtlasBlock, { type: "domain-map" }>): Promise<string> {
  return sectionHeader(b.title, b.badge) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}` +
    `<div class="diagram-box">${ENLARGE}${b.svg}</div>${atlasLegend(b.legend)}` +
    `${b.caption ? `<p class="diagram-caption">${await mi(b.caption)}</p>` : ""}`;
}

async function renderDomainIndex(b: Extract<AtlasBlock, { type: "domain-index" }>): Promise<string> {
  const tiles = (await Promise.all(b.tiles.map(async (t) => {
    const meta = t.meta?.length
      ? `<div class="domain-tile-meta">${(await Promise.all(t.meta.map(async (m) =>
          `<span>${m.key ? `<span class="dm-k">${escapeHtml(m.key)}</span> ` : ""}${await mi(m.value)}</span>`))).join("")}</div>`
      : "";
    const deps = t.deps?.length
      ? `<div class="domain-tile-deps"><span class="dep-label">depends on</span>${t.deps.map((d) => `<span class="dep-chip">${escapeHtml(d)}</span>`).join("")}</div>`
      : "";
    const head = `<div class="domain-tile-head"><span class="domain-tile-name">${escapeHtml(t.name)}</span>` +
      `<span class="domain-tile-path">${escapeHtml(t.path)}</span>` +
      `<span class="layer-chip layer-${escapeHtml(t.layer)}">${escapeHtml(t.layerLabel)}</span></div>`;
    const body = `${head}<p class="domain-tile-purpose">${await mi(t.purpose)}</p>${meta}${deps}`;
    if (t.href)
      return `<a class="domain-tile is-linked" href="${escapeHtml(t.href)}">${body}` +
        `<div class="domain-tile-foot">Open domain <span class="dtf-arrow" aria-hidden="true">&rarr;</span></div></a>`;
    return `<div class="domain-tile is-pending">${body}<div class="domain-tile-foot">Page pending</div></div>`;
  }))).join("");
  return sectionHeader(b.title, b.badge) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}<div class="domain-grid">${tiles}</div>`;
}

/** Dispatch one block to its renderer, wrapped in its <section>. Domain-page block cases are
 *  added in Tasks 6–7; atlas-tldr emits no <section> wrapper difference (it IS the lead section). */
export async function renderAtlasBlock(b: AtlasBlock, diagrams: Map<string, DiagramResult>, onWarn?: (m: string) => void): Promise<string> {
  const inner = await (async () => {
    switch (b.type) {
      case "atlas-tldr": return renderAtlasTldr(b);
      case "domain-map": return renderDomainMap(b);
      case "domain-index": return renderDomainIndex(b);
      default: onWarn?.(`atlas: no renderer for block type "${(b as AtlasBlock).type}"`); return "";
    }
  })();
  return `<section id="${escapeHtml(b.id)}" class="section">${inner}</section>`;
}
```

- [ ] **Step 4: Run it to verify it passes** → PASS; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/assemble-atlas.ts test/assemble-atlas.test.ts
git commit -m "feat(atlas): atlas-tldr, domain-map (raw svg), domain-index tiles"
```

---

## Task 6: Domain-page renderers — `domain-tldr`, `components`, `diagram-section`

**Files:**
- Modify: `src/assemble-atlas.ts`
- Test: `test/assemble-atlas.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
describe("domain-page renderers (lead + cards + arch)", () => {
  const empty = new Map();
  it("domain-tldr renders card + bigidea with the Domain eyebrow", async () => {
    const h = await renderAtlasBlock({ type: "domain-tldr", id: "tldr", heading: "h", rows: [{ key: "Owns", value: "x" }], bigIdea: { line: "the idea", sub: "s" } }, empty);
    expect(h).toContain('class="tldr-eyebrow">Domain');
    expect(h).toContain('class="bigidea-line"');
  });
  it("components renders cards as anchor links with a card-jump", async () => {
    const h = await renderAtlasBlock({ type: "components", id: "components", title: "The 6 brains", cards: [
      { name: "gm", purpose: "p", exports: [{ name: "computeGMAssessment" }, { name: "x", deputy: true }], href: "#c-gm" },
    ] }, empty);
    expect(h).toContain('a class="board-card" href="#c-gm"');
    expect(h).toContain('class="skill-chip">computeGMAssessment');
    expect(h).toContain('class="skill-chip is-deputy">x');
    expect(h).toContain('class="card-jump"');
  });
  it("diagram-section renders intro + diagram + optional callout", async () => {
    const map = new Map((await renderAll([{ type: "diagram", id: "d1", title: "", kind: "architecture", d2: "a -> b" }])).map((r) => [r.id, r]));
    const h = await renderAtlasBlock({ type: "diagram-section", id: "arch", title: "Internal architecture", intro: "i", diagram: { id: "d1", kind: "architecture", d2: "a -> b" }, callout: "note" }, map);
    expect(h).toContain('id="arch" class="section"');
    expect(h).toContain('class="diagram-box"');
    expect(h).toContain('class="callout"');
  });
});
```

- [ ] **Step 2: Run it to verify it fails** → FAIL (cases hit the `default` warn branch).

- [ ] **Step 3: Implement the three renderers; add cases to `renderAtlasBlock`**

```ts
async function renderDomainTldr(b: Extract<AtlasBlock, { type: "domain-tldr" }>): Promise<string> {
  const rows = (await Promise.all(b.rows.map(async (r) =>
    `<div class="tldr-row"><span class="tldr-key">${escapeHtml(r.key)}</span><span class="tldr-val">${await mi(r.value)}</span></div>`))).join("");
  const card = `<div class="tldr-card"><div class="tldr-header"><span class="tldr-eyebrow">${escapeHtml(b.eyebrow ?? "Domain")}</span>` +
    `<h2 class="tldr-heading">${await mi(b.heading)}</h2></div><div class="tldr-rows">${rows}</div></div>`;
  const big = b.bigIdea
    ? `<div class="bigidea"><div class="bigidea-label">${escapeHtml(b.bigIdea.label ?? "The load-bearing idea")}</div>` +
      `<div class="bigidea-line">${await mi(b.bigIdea.line)}</div>` +
      `${b.bigIdea.sub ? `<p class="bigidea-sub">${await mi(b.bigIdea.sub)}</p>` : ""}</div>`
    : "";
  return card + big;
}

async function renderComponents(b: Extract<AtlasBlock, { type: "components" }>): Promise<string> {
  const cards = (await Promise.all(b.cards.map(async (c) => {
    const chips = (c.exports ?? []).map((e) => `<span class="skill-chip${e.deputy ? " is-deputy" : ""}">${escapeHtml(e.name)}</span>`).join("");
    const row = chips ? `<div class="board-row"><span class="board-row-label">${escapeHtml(c.exportsLabel ?? "exports")}</span>${chips}</div>` : "";
    return `<a class="board-card" href="${escapeHtml(c.href)}"><div class="board-name">${escapeHtml(c.name)}</div>` +
      `<div class="board-purpose">${await mi(c.purpose)}</div>${row}` +
      `<div class="card-jump">Full section <span class="cj-arrow" aria-hidden="true">&darr;</span></div></a>`;
  }))).join("");
  return sectionHeader(b.title, b.badge) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}<div class="board-grid">${cards}</div>`;
}

async function renderDiagramSection(b: Extract<AtlasBlock, { type: "diagram-section" }>, diagrams: Map<string, DiagramResult>): Promise<string> {
  const callout = b.callout
    ? `<div class="callout"><span class="callout-icon" aria-hidden="true">&#9737;</span><span class="callout-text">${await mi(b.callout)}</span></div>`
    : "";
  return sectionHeader(b.title, b.badge) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}` +
    `${await renderAtlasDiagram(b.diagram, diagrams)}${callout}`;
}
```

Add these `case`s to `renderAtlasBlock`'s switch (before `default`):

```ts
      case "domain-tldr": return renderDomainTldr(b);
      case "components": return renderComponents(b);
      case "diagram-section": return renderDiagramSection(b, diagrams);
```

- [ ] **Step 4: Run it to verify it passes** → PASS; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/assemble-atlas.ts test/assemble-atlas.test.ts
git commit -m "feat(atlas): domain-tldr, components (linking cards), diagram-section"
```

---

## Task 7: Domain-page renderers — `depth`, `owns`, `seams`

The `depth` renderer is the load-bearing one: each component is a `.subsection` with header (name + path + back), detail paragraphs, its diagrams, an optional code block, Key files, Key exports, and Connections.

**Files:**
- Modify: `src/assemble-atlas.ts`
- Test: `test/assemble-atlas.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
describe("depth + owns + seams", () => {
  it("depth renders a full subsection per component", async () => {
    const map = new Map((await renderAll([{ type: "diagram", id: "gm-plan", title: "", kind: "architecture", d2: "a -> b" }])).map((r) => [r.id, r]));
    const h = await renderAtlasBlock({ type: "depth", id: "depth", title: "In depth", components: [
      { id: "c-gm", name: "gm", path: "lib/brain/gm", detail: ["First para.", "Second `code` para."],
        diagrams: [{ id: "gm-plan", kind: "architecture", d2: "a -> b", legend: [{ label: "x", fill: "#fff", stroke: "#000" }] }],
        codeHtml: '<div class="code-block"><pre>x</pre></div>',
        files: [{ name: "gm/plan/types.ts", desc: "the plan" }],
        exports: [{ name: "computeGMAssessment()", desc: "the read" }],
        connections: [{ dir: "produces", body: "a `StrategicPlan`" }] },
    ] }, map);
    expect(h).toContain('class="subsection" id="c-gm"');
    expect(h).toContain('class="subsection-title">gm <span class="subsection-path">lib/brain/gm');
    expect(h).toContain('subsection-back');
    expect(h).toContain('class="detail-p"');
    expect(h).toContain('class="code-block"');
    expect(h.match(/class="conns-label"/g)?.length).toBe(3);   // Key files, Key exports, Connections
    expect(h).toContain('class="owns-name">gm/plan/types.ts');
    expect(h).toContain('class="conn-dir">produces');
  });
  it("owns renders a name/desc list + note", async () => {
    const h = await renderAtlasBlock({ type: "owns", id: "data", title: "Data it owns", rows: [{ name: "BrainState", desc: "cross-season" }], note: "reads x" }, new Map());
    expect(h).toContain('class="owns-name">BrainState');
    expect(h).toContain('class="diagram-caption">');     // note styled as caption
  });
  it("seams renders exposes list + neighbor chips (linked vs flat)", async () => {
    const h = await renderAtlasBlock({ type: "seams", id: "seams", title: "Seams",
      exposes: [{ api: "runDayTriggers()", note: "daily" }],
      depends: [{ name: "sim", path: "lib/sim", href: "domain-sim.html" }, { name: "world", path: "lib/world" }] }, new Map());
    expect(h).toContain('class="seam-api"');
    expect(h).toContain('a class="neighbor-chip" href="domain-sim.html"');
    expect(h).toContain('class="neighbor-chip is-flat"');
  });
});
```

- [ ] **Step 2: Run it to verify it fails** → FAIL (default warn branch).

- [ ] **Step 3: Implement the three renderers; add cases to `renderAtlasBlock`**

```ts
function kvList(rows: KV[]): Promise<string> {
  return Promise.all(rows.map(async (r) =>
    `<div class="owns-row"><span class="owns-name">${escapeHtml(r.name)}</span>` +
    `<span class="owns-desc">${await mi(r.desc)}</span></div>`)).then((x) => `<div class="owns-list">${x.join("")}</div>`);
}
function labeled(label: string, body: string): string { return `<div class="conns-label">${label}</div>${body}`; }

async function renderComponentDeep(c: import("./atlas-blocks.js").ComponentDeep, diagrams: Map<string, DiagramResult>): Promise<string> {
  const head = `<div class="subsection-header"><h3 class="subsection-title">${escapeHtml(c.name)} ` +
    `<span class="subsection-path">${escapeHtml(c.path)}</span></h3>` +
    `<a href="#components" class="subsection-back">&uarr; back to cards</a></div>`;
  const detail = (await Promise.all(c.detail.map(async (p) => `<p class="detail-p">${await mi(p)}</p>`))).join("");
  const diags = (await Promise.all((c.diagrams ?? []).map((d) => renderAtlasDiagram(d, diagrams)))).join("");
  const code = c.codeHtml ?? "";
  const files = c.files?.length ? labeled("Key files", await kvList(c.files)) : "";
  const exports = c.exports?.length ? labeled("Key exports", await kvList(c.exports)) : "";
  const conns = c.connections?.length
    ? labeled("Connections", `<div class="conns">${(await Promise.all(c.connections.map(async (k) =>
        `<div class="conn"><span class="conn-dir">${escapeHtml(k.dir)}</span><span class="conn-body">${await mi(k.body)}</span></div>`))).join("")}</div>`)
    : "";
  return `<div class="subsection" id="${escapeHtml(c.id)}">${head}${detail}${diags}${code}${files}${exports}${conns}</div>`;
}

async function renderDepth(b: Extract<AtlasBlock, { type: "depth" }>, diagrams: Map<string, DiagramResult>): Promise<string> {
  const subs = (await Promise.all(b.components.map((c) => renderComponentDeep(c, diagrams)))).join("");
  return sectionHeader(b.title, b.badge) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}${subs}`;
}

async function renderOwns(b: Extract<AtlasBlock, { type: "owns" }>): Promise<string> {
  return sectionHeader(b.title) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}${await kvList(b.rows)}` +
    `${b.note ? `<p class="diagram-caption">${await mi(b.note)}</p>` : ""}`;
}

async function renderSeams(b: Extract<AtlasBlock, { type: "seams" }>): Promise<string> {
  const exposes = b.exposes.map((e) =>
    `<li>${escapeHtml(e.api)}${e.note ? ` <span class="api-note">— ${escapeHtml(e.note)}</span>` : ""}</li>`).join("");
  const neighbors = b.depends.map((d) => {
    const inner = `${escapeHtml(d.name)} <span class="nc-path">${escapeHtml(d.path)}</span>`;
    return d.href
      ? `<a class="neighbor-chip" href="${escapeHtml(d.href)}">${inner}</a>`
      : `<span class="neighbor-chip is-flat">${inner}</span>`;
  }).join("");
  const note = b.note ? `<p class="diagram-caption" style="margin-top:14px;">${await mi(b.note)}</p>` : "";
  return sectionHeader(b.title) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}` +
    `<div class="seam-cols">` +
    `<div class="seam-col seam-exposes"><div class="seam-head"><span aria-hidden="true">&#8593;</span> Exposes</div>` +
    `<div class="seam-body"><ul class="seam-api">${exposes}</ul></div></div>` +
    `<div class="seam-col seam-depends"><div class="seam-head"><span aria-hidden="true">&#8595;</span> Depends on</div>` +
    `<div class="seam-body"><div class="seam-neighbors">${neighbors}</div>${note}</div></div></div>`;
}
```

Add to `renderAtlasBlock`'s switch:

```ts
      case "depth": return renderDepth(b, diagrams);
      case "owns": return renderOwns(b);
      case "seams": return renderSeams(b);
```

Import `KV` and `ComponentDeep` types at the top: add `KV, ComponentDeep` to the `./atlas-blocks.js` import list (or use the inline `import("./atlas-blocks.js")` shown).

- [ ] **Step 4: Run it to verify it passes** → PASS; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/assemble-atlas.ts test/assemble-atlas.test.ts
git commit -m "feat(atlas): depth deep-dives (files/exports/connections), owns, seams"
```

---

## Task 8: Wire blocks into `assembleAtlas` + `assembleDomain` (render the main column)

Render the diagram pipeline once, build the diagrams map, render every block, and place the progress rail right after the lead tldr (mirroring `assemble-spec.ts`).

**Files:**
- Modify: `src/assemble-atlas.ts`
- Test: `test/assemble-atlas.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
describe("full page assembly", () => {
  it("atlas places the rail after the tldr and renders all blocks", async () => {
    const blocks: AtlasBlock[] = [
      { type: "atlas-tldr", id: "tldr", heading: "h", rows: [], primer: [] },
      { type: "domain-index", id: "domains", title: "The 7 domains", tiles: [] },
    ];
    const html = await assembleAtlas(blocks, { title: "Atlas" });
    expect(html).toContain('id="tldr" class="section"');
    expect(html).toContain('id="domains" class="section"');
    const railAt = html.indexOf("progress-rail"); const tldrAt = html.indexOf('id="tldr"'); const domAt = html.indexOf('id="domains"');
    expect(tldrAt).toBeLessThan(railAt); expect(railAt).toBeLessThan(domAt);    // tldr → rail → chapters
  });
  it("domain renders a depth diagram via the pipeline", async () => {
    const blocks: AtlasBlock[] = [
      { type: "domain-tldr", id: "tldr", heading: "h", rows: [] },
      { type: "depth", id: "depth", title: "In depth", components: [
        { id: "c-x", name: "x", path: "lib/x", detail: ["p"], diagrams: [{ id: "dx", kind: "architecture", d2: "a -> b" }] },
      ] },
    ];
    const html = await assembleDomain(blocks, { title: "x", layer: "engine", layerLabel: "Engine" });
    expect(html).toContain('id="c-x"');
    expect(html).toContain("diagram-svg");   // pipeline rendered + class injected
  });
});
```

- [ ] **Step 2: Run it to verify it fails** → FAIL (main is still empty `<main class="main"></main>`).

- [ ] **Step 3: Implement the shared body builder and use it in both assemblers**

```ts
async function renderMain(blocks: AtlasBlock[], opts: { outDir?: string; excalidraw?: boolean; onWarn?: (m: string) => void }): Promise<string> {
  const rendered = await renderAll(collectAtlasDiagrams(blocks), { outDir: opts.outDir, excalidraw: opts.excalidraw, onWarn: opts.onWarn });
  const diagrams = new Map<string, DiagramResult>();
  for (const r of rendered) diagrams.set(r.id, r);
  if (opts.onWarn) {
    const failed = rendered.filter((r) => r.failed).map((r) => r.id);
    if (failed.length) opts.onWarn(`${failed.length} diagram(s) failed to compile: ${failed.join(", ")} — fix their d2 source`);
  }
  const railHtml = rail(blocks);
  const parts: string[] = [];
  let railPlaced = false;
  for (const b of blocks) {
    parts.push(await renderAtlasBlock(b, diagrams, opts.onWarn));
    if (!railPlaced && (b.type === "atlas-tldr" || b.type === "domain-tldr")) { parts.push(railHtml); railPlaced = true; }
  }
  if (!railPlaced) parts.unshift(railHtml);
  return `<main class="main">${parts.join("")}</main>`;
}
```

Replace both assemblers' `main` lines:

```ts
// in assembleAtlas:
  const main = await renderMain(blocks, opts);
  return doc(opts.title, opts.generator, atlasTopbar(opts), sidebar(blocks, opts, null, true), main);
// in assembleDomain:
  const main = await renderMain(blocks, opts);
  return doc(opts.title, opts.generator, domainTopbar(opts), sidebar(blocks, opts, opts.layer, false), main);
```

- [ ] **Step 4: Run it to verify it passes** → PASS (`npx vitest run test/assemble-atlas.test.ts`); `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/assemble-atlas.ts test/assemble-atlas.test.ts
git commit -m "feat(atlas): render the main column + rail-after-tldr for both pages"
```

---

## Task 9: CLI (`bin/atlas.ts`) — render-only

Render one page (`--blocks <file>`) or a whole dir (`--all <dir>`). The JSON's `kind` field selects the assembler; the output filename is `atlas.html` for the atlas and `domain-<slug>.html` for a domain.

**Files:**
- Create: `bin/atlas.ts`
- Test: `test/atlas-cli.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/atlas-cli.test.ts
import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const exec = promisify(execFile);
const BIN = new URL("../bin/atlas.ts", import.meta.url).pathname;

const atlasDoc = { kind: "atlas", title: "Atlas · demo", blocks: [
  { type: "atlas-tldr", id: "tldr", heading: "h", rows: [] },
  { type: "domain-index", id: "domains", title: "The 1 domain", tiles: [
    { name: "sim", path: "lib/sim", layer: "engine", layerLabel: "Engine", purpose: "p", href: "domain-sim.html" } ] },
] };
const domainDoc = { kind: "domain", slug: "sim", title: "sim", layer: "engine", layerLabel: "Engine", path: "lib/sim", blocks: [
  { type: "domain-tldr", id: "tldr", heading: "h", rows: [] },
  { type: "seams", id: "seams", title: "Seams", exposes: [], depends: [] },
] };

describe("atlas CLI (render-only)", () => {
  it("renders one page from --blocks and re-writes its json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-"));
    await writeFile(join(dir, "atlas.json"), JSON.stringify(atlasDoc));
    await exec("npx", ["tsx", BIN, "--blocks", join(dir, "atlas.json"), "--out", dir]);
    const html = await readFile(join(dir, "atlas.html"), "utf8");
    expect(html).toContain("Atlas · demo");
    expect(html).toContain(".domain-tile");
  });
  it("--all renders the atlas + every domain-*.json in the dir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-"));
    await writeFile(join(dir, "atlas.json"), JSON.stringify(atlasDoc));
    await writeFile(join(dir, "domain-sim.json"), JSON.stringify(domainDoc));
    await exec("npx", ["tsx", BIN, "--all", dir, "--out", dir]);
    const files = await readdir(dir);
    expect(files).toContain("atlas.html");
    expect(files).toContain("domain-sim.html");
    const dom = await readFile(join(dir, "domain-sim.html"), "utf8");
    expect(dom).toContain('class="topbar-back"');
  });
});
```

- [ ] **Step 2: Run it to verify it fails** → FAIL (`bin/atlas.ts` missing).

- [ ] **Step 3: Implement `bin/atlas.ts`**

```ts
#!/usr/bin/env -S node --import tsx
// visual-atlas CLI (Phase 2: render-only). Renders committed JSON into self-contained pages.
//
//   npx tsx bin/atlas.ts --blocks <ABS file.json> --out <ABS dir>   # one page
//   npx tsx bin/atlas.ts --all <ABS dir> --out <ABS dir>            # atlas.json + every domain-*.json
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, isAbsolute, basename } from "node:path";
import { parseArgs } from "node:util";
import { assembleAtlas, assembleDomain } from "../src/assemble-atlas.js";
import type { AtlasBlock, AtlasOpts, DomainOpts } from "../src/atlas-blocks.js";

interface AtlasDoc extends Partial<AtlasOpts> { kind: "atlas"; blocks: AtlasBlock[]; }
interface DomainDoc extends Partial<DomainOpts> { kind: "domain"; slug: string; blocks: AtlasBlock[]; }
type Doc = AtlasDoc | DomainDoc;

async function renderFile(file: string, outDir: string): Promise<string> {
  const doc = JSON.parse(await readFile(file, "utf8")) as Doc;
  if (!Array.isArray(doc.blocks)) throw new Error(`${file}: expected { "blocks": [...] }`);
  const warnings: string[] = [];
  const onWarn = (m: string) => warnings.push(m);
  let html: string, outName: string;
  if (doc.kind === "domain") {
    const o: DomainOpts = { ...doc, title: doc.title ?? doc.slug, layer: doc.layer ?? "engine",
      layerLabel: doc.layerLabel ?? "Engine", outDir, onWarn, generator: doc.generator ?? "visual-skills · visual-atlas" };
    html = await assembleDomain(doc.blocks, o);
    outName = `domain-${doc.slug}.html`;
  } else {
    const o: AtlasOpts = { ...doc, title: doc.title ?? "System Atlas", outDir, onWarn, generator: doc.generator ?? "visual-skills · visual-atlas" };
    html = await assembleAtlas(doc.blocks, o);
    outName = "atlas.html";
  }
  await writeFile(join(outDir, outName), html);
  await writeFile(join(outDir, basename(file)), JSON.stringify(doc, null, 2));   // re-write source, formatted
  for (const w of warnings) console.warn(`⚠ ${basename(file)}: ${w}`);
  return outName;
}

async function main() {
  const { values } = parseArgs({ options: { blocks: { type: "string" }, all: { type: "string" }, out: { type: "string" } } });
  const outDir = values.out;
  if (!outDir || !isAbsolute(outDir)) { console.error("usage: atlas (--blocks <file> | --all <dir>) --out <ABS dir>"); process.exit(2); }
  await mkdir(outDir, { recursive: true });
  if (values.all) {
    if (!isAbsolute(values.all)) { console.error("--all must be an absolute path"); process.exit(2); }
    const entries = (await readdir(values.all)).filter((f) => f === "atlas.json" || (f.startsWith("domain-") && f.endsWith(".json")));
    entries.sort((a, b) => (a === "atlas.json" ? -1 : b === "atlas.json" ? 1 : a.localeCompare(b)));
    for (const f of entries) console.log(`wrote ${await renderFile(join(values.all, f), outDir)}`);
  } else if (values.blocks) {
    if (!isAbsolute(values.blocks)) { console.error("--blocks must be an absolute path"); process.exit(2); }
    console.log(`wrote ${await renderFile(values.blocks, outDir)}`);
  } else { console.error("need --blocks <file> or --all <dir>"); process.exit(2); }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Run it to verify it passes** → PASS (`npx vitest run test/atlas-cli.test.ts`); `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add bin/atlas.ts test/atlas-cli.test.ts
git commit -m "feat(atlas): render-only CLI (--blocks one page, --all a dir)"
```

---

## Task 10: Package wiring

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Inspect current bins/scripts**

Run: `grep -n '"bin"\|"scripts"\|visual-spec\|"spec"' package.json`
Expected: a `"bin"` map with `"visual-spec": "bin/spec.ts"` and a `"scripts"` map with `"spec": "tsx bin/spec.ts"`.

- [ ] **Step 2: Add the atlas bin + script**

In `package.json` `"bin"`, add (after `visual-spec`): `"visual-atlas": "bin/atlas.ts"`.
In `package.json` `"scripts"`, add (after `spec`): `"atlas": "tsx bin/atlas.ts"`.

- [ ] **Step 3: Verify**

Run: `node -e "const p=require('./package.json'); if(!p.bin['visual-atlas']||!p.scripts.atlas) process.exit(1); console.log('ok')"`
Expected: `ok`. Then `npx tsc --noEmit` → clean and `npx vitest run` → all green.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore(atlas): register visual-atlas bin + atlas script"
```

---

## Task 11: Author the canonical JSON + regenerate (acceptance)

Reverse-engineer the four committed canonical HTML pages into `atlas.json` + `domain-{brain,sim,story}.json`, then regenerate and confirm the output matches. The HTML becomes tool-generated (like `spec.html`); the JSON is the source of truth.

**Files:**
- Create: `example/atlas-sports-rpg/atlas.json`, `domain-brain.json`, `domain-sim.json`, `domain-story.json`
- Modify (regenerated): `example/atlas-sports-rpg/*.html`
- Test: `test/assemble-atlas.test.ts` (append an acceptance test)

- [ ] **Step 1: Author the JSON from the committed HTML**

For each page, translate its sections into blocks using the model. Source the exact text/markup from the committed HTML (open `example/atlas-sports-rpg/atlas.html` etc.). Key mappings:
- Atlas: `atlas-tldr` (heading + What/Shape/Spine rows + the 4 primer items) → `domain-map` (the hand-authored `<svg class="diagram-svg map-svg flow-svg" …>…</svg>` copied verbatim into `svg`, plus its 6-item legend + caption) → `diagram-section` id `spine` (the `season-spine` diagram: copy the `d2` + `mermaid` from `/tmp/atlas-build/render-diagrams.ts` if still present, else re-author per the catalog; legend = the single gold "Repeats per game / per day"; caption) → `domain-index` (the 7 tiles; `href` set for sim/brain/story, omitted for the 4 pending).
  - Atlas opts: `title: "System Atlas · sports-rpg"`, `stack: "Next.js · TypeScript"`, `count: "7 domains"`, `date: "generated 2026-06-19"`, `note: "in-memory state"`, `meta: [{Root}, {Domains}, {Read first}]`.
- Each domain: `domain-tldr` (heading + rows + bigIdea) → `components` (cards, each `href: "#c-…"`) → `diagram-section` (internal-arch) → `depth` (one `ComponentDeep` per card: `detail` paragraphs, `diagrams` with their `d2`/`mermaid`/`legend`, `codeHtml` for `roster-soa`, `files`, `exports`, `connections`) → `owns` → `seams`.
  - Domain opts (brain): `title: "brain"`, `layer: "intelligence"`, `layerLabel: "Intelligence"`, `path: "lib/brain"`, `count: "~76 files"`, `depends: "sim · world · profiles"`, `meta: [Layer, Path, Files, Depends on]`.
  - Reuse the exact `d2`/`mermaid` diagram sources from the Phase-1 render script for byte-identical diagrams.

- [ ] **Step 2: Regenerate and eyeball**

Run:
```bash
cd ~/Projects/visual-skills
npx tsx bin/atlas.ts --all "$PWD/example/atlas-sports-rpg" --out "$PWD/example/atlas-sports-rpg"
```
Expected: `wrote atlas.html` + three `wrote domain-*.html`, zero warnings. Open `example/atlas-sports-rpg/atlas.html` and the three domain pages; confirm they match the committed canonical (lead, hero, spine, tiles; per-domain cards → deep sections with diagrams/files/exports/connections). Diff against the pre-regeneration HTML (`git diff --stat`) — expect only formatting-level differences, not structural ones.

- [ ] **Step 3: Write the acceptance test**

```ts
// append to test/assemble-atlas.test.ts
import { readFileSync } from "node:fs";
const fix = (p: string) => JSON.parse(readFileSync(new URL("../example/atlas-sports-rpg/" + p, import.meta.url), "utf8"));

describe("canonical regeneration (acceptance)", () => {
  it("atlas.json renders the spine, the domain map, and 7 tiles", async () => {
    const doc = fix("atlas.json");
    const html = await assembleAtlas(doc.blocks, { ...doc, title: doc.title });
    expect(html).toContain('id="spine" class="section"');
    expect(html).toContain("map-svg");
    expect(html).toContain('class="progress-step-label">Spine');
    expect((html.match(/class="domain-tile /g) || []).length).toBe(7);
    expect(html).not.toMatch(/season spine/i);     // generic vocabulary
  });
  it("domain-brain.json renders 6 deep sections each with files + exports + connections", async () => {
    const doc = fix("domain-brain.json");
    const html = await assembleDomain(doc.blocks, { ...doc, title: doc.title });
    for (const id of ["c-gm","c-coach","c-owner","c-player","c-scout","c-agent"]) expect(html).toContain(`id="${id}"`);
    expect((html.match(/conns-label">Key files/g) || []).length).toBe(6);
    expect((html.match(/conns-label">Connections/g) || []).length).toBe(6);
  });
});
```

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run` → all green. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add example/atlas-sports-rpg/*.json example/atlas-sports-rpg/*.html test/assemble-atlas.test.ts
git commit -m "feat(atlas): canonical JSON source-of-truth; regenerate HTML from it"
```

---

## Self-review (run before handoff)

**Spec coverage** (against `docs/superpowers/specs/2026-06-19-visual-atlas-skill-design.md`, Phase 2 scope = "Block model + assembler + CLI (render-only)"):
- Block model → Task 1. Atlas page blocks (tldr, domain-map, spine via diagram-section, domain-index) → Tasks 5, 6. Domain page blocks (tldr, components, internal-arch via diagram-section, depth, owns, seams) → Tasks 6, 7. Multi-file cross-linked output → Tasks 8, 9, 11 (the `#c-*` and `domain-*.html` links are authored in content; the CLI emits all files into one dir). Render-only CLI + render-only artifact reproducibility → Task 9 (`--blocks`, `--all`; re-writes the JSON). Dedicated `atlas.css` inlined → Task 2 (`doc()`). Canonical = sports-rpg, regenerated from JSON → Task 11.
- Deferred by design (NOT Phase 2): the scanner + `atlas.domains.json` (Phase 3); `lint-atlas.ts`, the skill, the catalog, the dogfood (Phase 4). `renderMain`'s `onWarn` already has the hook where `lintAtlas(blocks)` will be called in Phase 4.

**Placeholder scan:** no "TBD/TODO"; every code step has complete code; every test has real assertions. Task 11 Step 1 references the committed HTML + the Phase-1 render-script diagram sources as the concrete oracle (not a placeholder — the content already exists to copy).

**Type consistency:** `AtlasBlock` union, `AtlasDiagram`, `ComponentDeep`, `KV`, `LegendItem`, `AtlasOpts`, `DomainOpts` are defined in Task 1/2 and used verbatim in Tasks 3–11. Helpers (`collectAtlasDiagrams`, `assertUniqueAtlasIds`, `isAtlasChapter`, `atlasChapterLabel`, `LAYER_DOTS`, `atlasDiagramToBlock`) match between definition (Task 1) and use. Renderer/ helper names (`renderAtlasBlock`, `renderAtlasDiagram`, `atlasLegend`, `renderMain`, `sidebar`, `rail`) are consistent across tasks. CSS classes match the committed canonical exactly (`domain-tile`, `layer-<layer>`, `card-jump`, `outline-sub`, `conns-label`, `owns-row`, `seam-*`, `neighbor-chip`, `nav-domain`).
