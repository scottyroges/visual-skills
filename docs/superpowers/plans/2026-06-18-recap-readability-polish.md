# Recap Readability & Navigation Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recap/plan HTML output dramatically more readable and navigable — zoomable diagrams, collapsible diffs/groups, clickable file tree, importance ordering, readable diagram colors with a legend, keyword-linked summaries, and group descriptions.

**Architecture:** The renderer stays a pure block→HTML pipeline producing one self-contained file. We relax the "no view-time JS" rule to allow ONE inlined, self-contained viewer script (no external `src`, runs on `file://`). Native `<details>` provides collapsibility with no JS. Diagram colors gain dark ink text + an auto-derived legend. Skill/catalog docs gain authoring guidance.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), vitest, d2 binary, marked + sanitize-html, Shiki. Tests: `npm test -- <substr>`, typecheck: `npm run typecheck`.

**Spec:** `docs/superpowers/specs/2026-06-18-recap-readability-polish-design.md`

**Phase → commit grouping** (group case is touched once, in Task 3, so group collapse + description ship together):
- Phase 1 — Viewer & collapsibility: Tasks 1–3
- Phase 2 — File tree & ordering: Tasks 4–5
- Phase 3 — Colors & legend: Tasks 6–7
- Phase 4 — Summary & guidance: Tasks 8–9

**Conventions:** all source under `src/`, assets under `assets/`, tests under `test/`. Inline-style hex on legend swatches is trusted (our own palette data, never user input). Run `npm run typecheck` after each task's implementation step.

---

## Phase 1 — Viewer & collapsibility

### Task 1: Inlined viewer script (zoom overlay + open-on-hash) and zoomable diagram wrap

**Files:**
- Create: `assets/viewer.js`
- Modify: `src/assemble.ts` (read+inline viewer, wrap diagrams in `.vs-zoomable`)
- Modify: `assets/template.css` (overlay + zoomable cursor styles)
- Modify: `test/assemble.test.ts` (relax script assertion, add viewer test)
- Modify: `test/plan-cli.test.ts:21`, `test/recap-emit-blocks.test.ts:22` (relax script assertion)

- [ ] **Step 1: Write the failing test**

Add to `test/assemble.test.ts` inside `describe("assemble", ...)`:

```ts
  it("inlines exactly one self-contained viewer script (no external src) and wraps diagrams as zoomable", async () => {
    const blocks: Block[] = [
      { type: "diagram", id: "flow", title: "Flow", kind: "flowchart", d2: "a -> b" },
    ];
    const html = await assemble(blocks, { title: "T", source: "s" });
    expect(html).toContain("<script>");                 // the inlined viewer
    expect(html).not.toMatch(/<script[^>]*\ssrc=/i);    // never an external script
    expect(html).toContain("vs-zoom-overlay");          // viewer code is present
    expect(html).toContain('class="vs-zoomable"');      // the diagram svg is wrapped
  }, 30_000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- assemble`
Expected: FAIL — the new test fails (`vs-zoomable`/`<script>` absent). Pre-existing `not.toContain("<script")` assertions still pass for now.

- [ ] **Step 3: Create the viewer script**

Create `assets/viewer.js`:

```js
/* Self-contained recap viewer — runs on file://, no external loads.
   (1) click any .vs-zoomable diagram -> full-screen overlay: drag to pan, wheel/pinch to zoom.
   (2) open <details> ancestors of a hash target so in-page links land on visible content. */
(function () {
  "use strict";

  function openAncestors(el) {
    for (var n = el; n; n = n.parentElement) {
      if (n.tagName === "DETAILS") n.open = true;
    }
  }
  function revealHash() {
    if (!location.hash) return;
    var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (!target) return;
    openAncestors(target);
    target.scrollIntoView();
  }

  var overlay, stage, img, scale = 1, tx = 0, ty = 0, dragging = false, lastX = 0, lastY = 0;

  function apply() {
    if (img) img.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
  }
  function hide() { if (overlay) overlay.classList.remove("open"); }

  function build() {
    overlay = document.createElement("div");
    overlay.className = "vs-zoom-overlay";
    stage = document.createElement("div");
    stage.className = "vs-zoom-stage";
    var reset = document.createElement("button");
    reset.type = "button"; reset.className = "vs-zoom-reset"; reset.textContent = "Reset";
    var close = document.createElement("button");
    close.type = "button"; close.className = "vs-zoom-close";
    close.setAttribute("aria-label", "Close"); close.textContent = "✕";
    overlay.appendChild(stage); overlay.appendChild(reset); overlay.appendChild(close);
    document.body.appendChild(overlay);

    overlay.addEventListener("click", function (e) { if (e.target === overlay) hide(); });
    close.addEventListener("click", hide);
    reset.addEventListener("click", function () { scale = 1; tx = 0; ty = 0; apply(); });
    overlay.addEventListener("wheel", function (e) {
      e.preventDefault();
      scale = Math.min(20, Math.max(0.2, scale * (e.deltaY < 0 ? 1.1 : 0.9)));
      apply();
    }, { passive: false });
    stage.addEventListener("pointerdown", function (e) {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    });
    stage.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      tx += e.clientX - lastX; ty += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY; apply();
    });
    stage.addEventListener("pointerup", function () { dragging = false; });
  }

  function show(svg) {
    if (!overlay) build();
    stage.innerHTML = "";
    img = svg.cloneNode(true);
    img.removeAttribute("width"); img.removeAttribute("height");
    img.classList.add("vs-zoom-svg");
    stage.appendChild(img);
    scale = 1; tx = 0; ty = 0; apply();
    overlay.classList.add("open");
  }

  document.addEventListener("keydown", function (e) { if (e.key === "Escape") hide(); });
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("a")) return; // let edit links work
    var z = e.target.closest && e.target.closest(".vs-zoomable");
    if (!z) return;
    var svg = z.querySelector("svg");
    if (svg) show(svg);
  });

  if (document.readyState !== "loading") revealHash();
  else document.addEventListener("DOMContentLoaded", revealHash);
  window.addEventListener("hashchange", revealHash);
})();
```

- [ ] **Step 4: Inline the viewer and wrap diagrams in `src/assemble.ts`**

Wrap the diagram SVG in a zoomable container — change `diagramInner` (currently at `src/assemble.ts:75-80`) to:

```ts
  // svg (zoomable) + optional editable link, without the outer <section> — reused by diagram
  // blocks and by diagrams embedded inside a diff/overview. The edit link sits OUTSIDE the
  // zoomable wrapper so clicking it navigates instead of opening the zoom overlay.
  const diagramInner = (r: (typeof rendered)[number]): string => {
    const link = r.editable
      ? `<div class="vs-edit"><a href="${escapeHtml(basename(r.editable))}">open in Excalidraw</a></div>`
      : "";
    return `<div class="vs-zoomable">${r.svg}</div>${link}`;
  };
```

Read the viewer alongside the CSS — change the `const css = ...` line (`src/assemble.ts:164`) to:

```ts
  const css = await readFile(join(ASSETS, "template.css"), "utf8");
  const viewer = await readFile(join(ASSETS, "viewer.js"), "utf8");
```

Inline it before `</body>` — change the final `return (...)` block so the body ends with the script. Replace the closing template line:

```ts
    `<body><main class="vs-doc">${header}${fragments.join("")}${opts.generator ? `<footer class="vs-generator">Generated by ${escapeHtml(opts.generator)}</footer>` : ""}</main><script>${viewer}</script></body></html>\n`
```

- [ ] **Step 5: Add overlay + zoomable styles to `assets/template.css`**

Append:

```css
/* ── zoomable diagrams + full-screen overlay (viewer.js) ──────────────────────── */
.vs-zoomable { cursor: zoom-in; }
.vs-zoom-overlay { display: none; position: fixed; inset: 0; z-index: 1000;
  background: rgba(20,18,16,0.82); }
.vs-zoom-overlay.open { display: block; }
.vs-zoom-stage { position: absolute; inset: 0; overflow: hidden; cursor: grab;
  display: flex; align-items: center; justify-content: center; touch-action: none; }
.vs-zoom-stage:active { cursor: grabbing; }
.vs-zoom-svg { transform-origin: center center; max-width: 92vw; max-height: 92vh; }
.vs-zoom-reset, .vs-zoom-close { position: absolute; top: 16px; border: 1px solid #d6d3cd;
  background: #fff; border-radius: 8px; padding: 6px 12px; font: inherit; cursor: pointer; }
.vs-zoom-reset { right: 96px; }
.vs-zoom-close { right: 16px; font-weight: 700; }
```

- [ ] **Step 6: Relax the document-level script assertions**

In `test/assemble.test.ts`, replace EACH of the 5 lines `expect(html).not.toContain("<script");` with:

```ts
    expect(html).not.toMatch(/<script[^>]*\ssrc=/i); // only the inlined viewer, never external
```

In `test/plan-cli.test.ts:21`, replace `expect(html).not.toContain("<script");` with:

```ts
      expect(html).not.toMatch(/<script[^>]*\ssrc=/i); // only the inlined viewer, never external
```

In `test/recap-emit-blocks.test.ts:22`, replace `expect(html).not.toContain("<script");` with:

```ts
    expect(html).not.toMatch(/<script[^>]*\ssrc=/i); // only the inlined viewer, never external
```

Leave `test/markdown.test.ts` and `test/prose.test.ts` UNCHANGED — those prove user content cannot inject script and must stay strict.

- [ ] **Step 7: Run tests and typecheck**

Run: `npm test -- assemble plan-cli recap-emit-blocks && npm run typecheck`
Expected: PASS (all, including the new viewer test).

- [ ] **Step 8: Commit**

```bash
git add assets/viewer.js src/assemble.ts assets/template.css test/assemble.test.ts test/plan-cli.test.ts test/recap-emit-blocks.test.ts
git commit -m "feat: inlined viewer script with zoom-overlay + open-on-hash for diagrams"
```

---

### Task 2: Collapse diff hunks under a `<details>` (collapsed by default)

**Files:**
- Modify: `src/renderers/diff.ts`
- Modify: `assets/template.css`
- Modify: `test/diff.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `test/diff.test.ts` inside `describe("renderDiff", ...)`:

```ts
  it("collapses the hunks under a <details>, keeping description above it", async () => {
    const block: DiffBlock = {
      type: "diff", id: "d", title: "x.ts", path: "src/x.ts",
      description: "Adds a thing.",
      hunks: [{ header: "@@ -1 +2 @@", lines: ["+a", "+b", "-c"] }],
    };
    const html = await renderDiff(block);
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("View changes");
    expect(html).toContain("+2");  // added count
    expect(html).toContain("-1");  // deleted count
    // description sits above the <details> that holds the hunks
    expect(html.indexOf("vs-diff-desc")).toBeLessThan(html.indexOf("<details"));
    expect(html.indexOf("<details")).toBeLessThan(html.indexOf("vs-hunk"));
    // collapsed by default: the details element has no `open` attribute
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- diff`
Expected: FAIL — no `<details>`/`View changes` yet.

- [ ] **Step 3: Implement collapsible hunks in `src/renderers/diff.ts`**

Add a counter helper after the imports (below `stripMarker`, before `renderHunk`):

```ts
function countChanges(hunks: DiffHunk[]): { added: number; deleted: number } {
  let added = 0, deleted = 0;
  for (const h of hunks) {
    for (const l of h.lines) {
      if (l.startsWith("+")) added++;
      else if (l.startsWith("-")) deleted++;
    }
  }
  return { added, deleted };
}
```

Replace the `return (...)` in `renderDiff` (currently `src/renderers/diff.ts:56-64`) with:

```ts
  const { added, deleted } = countChanges(block.hunks);
  return (
    `<section class="vs-block vs-diff">` +
    `<h2>${escapeHtml(block.title)}</h2>` +
    `<div class="vs-path">${escapeHtml(block.path)}</div>` +
    desc +
    diagramHtml +
    `<details class="vs-diff-code"><summary>View changes ` +
    `<span class="vs-diff-stat vs-add">+${added}</span> ` +
    `<span class="vs-diff-stat vs-del">-${deleted}</span></summary>` +
    hunks.join("") +
    `</details>` +
    `</section>`
  );
```

- [ ] **Step 4: Add diff-collapse styles to `assets/template.css`**

Append:

```css
/* ── collapsible diff code ────────────────────────────────────────────────────── */
.vs-diff-code > summary { cursor: pointer; color: var(--ctx); font-size: 0.85em;
  font-family: ui-monospace, monospace; padding: 4px 0; user-select: none; }
.vs-diff-code .vs-diff-stat { font-weight: 600; }
.vs-diff-code .vs-diff-stat.vs-add { color: var(--add); }
.vs-diff-code .vs-diff-stat.vs-del { color: var(--del); }
/* scannable description lists (item #6) */
.vs-diff-desc ul, .vs-diff-desc ol { margin: 4px 0; padding-left: 1.2rem; }
.vs-diff-desc li { margin: 2px 0; }
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- diff && npm run typecheck`
Expected: PASS. The existing "desc before hunks" / "diagram before hunks" ordering tests still hold (hunks are now inside `<details>` but later in the string).

- [ ] **Step 6: Commit**

```bash
git add src/renderers/diff.ts assets/template.css test/diff.test.ts
git commit -m "feat: collapse diff hunks under a details element (collapsed by default)"
```

---

### Task 3: Collapsible groups (open by default) + group descriptions

**Files:**
- Modify: `src/blocks.ts` (add `GroupBlock.description`)
- Modify: `src/assemble.ts` (group case: `<details open>` + description)
- Modify: `assets/template.css`
- Modify: `test/assemble.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `test/assemble.test.ts` inside `describe("assemble", ...)`:

```ts
  it("renders a group as an open collapsible details with a markdown description", async () => {
    const blocks: Block[] = [
      { type: "group", id: "g1", title: "Core change", description: "The **heart** of it.",
        blocks: [
          { type: "diff", id: "diff-0", title: "x.ts", path: "src/x.ts",
            hunks: [{ header: "@@", lines: ["+a"] }] },
        ] },
    ];
    const html = await assemble(blocks, { title: "T", source: "s" });
    expect(html).toContain('class="vs-block vs-group"');
    expect(html).toMatch(/<details[^>]*\bopen\b/);        // groups start open
    expect(html).toContain('class="vs-group-desc"');
    expect(html).toContain("<strong>heart</strong>");      // description is markdown
    expect(html).toContain('id="g1"');                     // anchor preserved
  }, 30_000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- assemble`
Expected: FAIL — no `vs-group-desc`/open details (and `description` is not yet a valid field, so this also surfaces as a type error in Step 1's literal until Step 3).

- [ ] **Step 3: Add the `description` field in `src/blocks.ts`**

Change `GroupBlock` (currently `src/blocks.ts:88-93`) to:

```ts
export interface GroupBlock {
  type: "group";
  id: string;
  title: string;
  description?: string;  // optional markdown shown under the group title
  blocks: Block[];   // one level of nesting — children are non-group blocks
}
```

- [ ] **Step 4: Render the group as an open details with description in `src/assemble.ts`**

Add the markdown import near the other renderer imports (after `src/assemble.ts:8`):

```ts
import { renderMarkdown } from "./renderers/markdown.js";
```

Replace the `case "group"` body (currently `src/assemble.ts:119-128`) with:

```ts
      case "group": {
        for (const child of b.blocks) {
          if (child.type === "group") {
            throw new Error(`group "${b.id}" contains a nested group "${child.id}" — groups may not nest`);
          }
        }
        const children = await Promise.all(b.blocks.map(renderBlock));
        const desc = b.description
          ? `<div class="vs-group-desc">${await renderMarkdown(b.description, opts.onWarn)}</div>`
          : "";
        html =
          `<section class="vs-block vs-group"><details open>` +
          `<summary class="vs-group-summary"><span class="vs-group-title">${escapeHtml(b.title)}</span></summary>` +
          `${desc}${children.join("")}</details></section>`;
        break;
      }
```

- [ ] **Step 5: Add group styles to `assets/template.css`**

Replace the existing `.vs-group > h2 { margin-top:0; }` rule (`assets/template.css:69`) with:

```css
.vs-group > details > summary { cursor: pointer; list-style: none; user-select: none; }
.vs-group-title { font-size: 1.3rem; font-weight: 700; }
.vs-group-desc { margin: 8px 0 12px; font-size: 0.95em; color: #44403c; }
.vs-group-desc p { margin: 4px 0; }
.vs-group-desc ul, .vs-group-desc ol { margin: 4px 0; padding-left: 1.2rem; }
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -- assemble && npm run typecheck`
Expected: PASS. The pre-existing "renders a group with nested blocks, anchors, and a nested diagram" test still passes (title text, anchors, and nested ids are all still present).

- [ ] **Step 7: Commit**

```bash
git add src/blocks.ts src/assemble.ts assets/template.css test/assemble.test.ts
git commit -m "feat: collapsible groups (open by default) with markdown descriptions"
```

---

## Phase 2 — File tree & ordering

### Task 4: Clickable file-tree filenames + consistent typography

**Files:**
- Modify: `src/renderers/file-tree.ts` (accept a `path → id` map, link matching files)
- Modify: `src/assemble.ts` (build the map, pass it in)
- Modify: `assets/template.css`
- Modify: `test/file-tree.test.ts`
- Modify: `test/assemble.test.ts`

- [ ] **Step 1: Write the failing test**

Replace the body of the single test in `test/file-tree.test.ts` (keep the imports) by adding the map argument and link assertions. Add this new test after the existing one (inside `describe("renderFileTree", ...)`):

```ts
  it("links a filename to its diff when a path->id map entry exists; leaves others plain", () => {
    const block: FileTreeBlock = {
      type: "file-tree", id: "ft", title: "Files",
      files: [
        { path: "src/lib/paypal.ts", status: "A", added: 10, deleted: 0 },
        { path: "src/lib/stripe.ts", status: "D", added: 0, deleted: 4 },
      ],
    };
    const html = renderFileTree(block, new Map([["src/lib/paypal.ts", "diff-7"]]));
    expect(html).toContain('href="#diff-7"');         // linked file
    expect(html).toContain("paypal.ts");
    // stripe.ts has no map entry -> plain name, not a link to a diff
    expect(html).not.toContain('href="#stripe');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- file-tree`
Expected: FAIL — `renderFileTree` takes one argument; the map arg + `href="#diff-7"` are absent (type error on the 2nd arg).

- [ ] **Step 3: Thread the map through `src/renderers/file-tree.ts`**

Replace the whole file `src/renderers/file-tree.ts` with:

```ts
import { escapeHtml } from "../html.js";
import type { FileChange, FileTreeBlock } from "../blocks.js";

interface TreeNode {
  name: string;
  children: Map<string, TreeNode>;
  file?: FileChange;
}

function buildTree(files: FileChange[]): TreeNode {
  const root: TreeNode = { name: "", children: new Map() };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, children: new Map() };
        node.children.set(part, child);
      }
      if (i === parts.length - 1) child.file = f;
      node = child;
    });
  }
  return root;
}

function renderFile(f: FileChange, name: string, pathToId: Map<string, string>): string {
  const badge =
    `<span class="vs-badge vs-add">+${f.added}</span>` +
    `<span class="vs-badge vs-del">-${f.deleted}</span>`;
  const id = pathToId.get(f.path);
  const label = id
    ? `<a class="vs-name vs-file-link" href="#${escapeHtml(id)}">${escapeHtml(name)}</a>`
    : `<span class="vs-name">${escapeHtml(name)}</span>`;
  return (
    `<li class="vs-file" data-status="${f.status}">` +
    `<span class="vs-marker">${f.status}</span> ` +
    `${label} ${badge}</li>`
  );
}

function renderNode(node: TreeNode, pathToId: Map<string, string>): string {
  const items: string[] = [];
  for (const child of node.children.values()) {
    if (child.file) {
      items.push(renderFile(child.file, child.name, pathToId));
      continue;
    }
    // Collapse single-child directory chains: src -> lib becomes "src/lib".
    let display = child.name;
    let dir = child;
    while (dir.children.size === 1) {
      const only = [...dir.children.values()][0];
      if (only.file) break;
      display += "/" + only.name;
      dir = only;
    }
    items.push(
      `<li class="vs-dir"><span class="vs-name">${escapeHtml(display)}</span>` +
        `<ul>${renderNode(dir, pathToId)}</ul></li>`,
    );
  }
  return items.join("");
}

export function renderFileTree(block: FileTreeBlock, pathToId: Map<string, string> = new Map()): string {
  const tree = renderNode(buildTree(block.files), pathToId);
  return (
    `<section class="vs-block vs-file-tree">` +
    `<h2>${escapeHtml(block.title)}</h2>` +
    `<ul class="vs-tree">${tree}</ul></section>`
  );
}
```

- [ ] **Step 4: Build and pass the map in `src/assemble.ts`**

Add a path→id collector near `collectDiagrams` (after the `collectDiagrams` definition ends, around `src/assemble.ts:57`):

```ts
  // Map each diff block's file path to its block id, so the file tree can link filenames to diffs.
  const collectDiffPaths = (bs: Block[], map = new Map<string, string>()): Map<string, string> => {
    for (const b of bs) {
      if (b.type === "diff") map.set(b.path, b.id);
      else if (b.type === "group") collectDiffPaths(b.blocks, map);
    }
    return map;
  };
  const pathToId = collectDiffPaths(blocks);
```

Change the file-tree case (currently `src/assemble.ts:93`) to pass the map:

```ts
      case "file-tree": html = renderFileTree(b, pathToId); break;
```

- [ ] **Step 5: Add an assemble-level integration test**

Add to `test/assemble.test.ts` inside `describe("assemble", ...)`:

```ts
  it("links a file-tree entry to its diff block by path", async () => {
    const blocks: Block[] = [
      { type: "file-tree", id: "files", title: "Files changed",
        files: [{ path: "src/x.ts", status: "M", added: 1, deleted: 0 }] },
      { type: "diff", id: "diff-0", title: "x.ts", path: "src/x.ts",
        hunks: [{ header: "@@", lines: ["+a"] }] },
    ];
    const html = await assemble(blocks, { title: "T", source: "s" });
    expect(html).toContain('href="#diff-0"');
  });
```

- [ ] **Step 6: Normalize file-tree typography in `assets/template.css`**

Replace the existing `.vs-file, .vs-dir { ... }` and `.vs-badge { ... }` rules (`assets/template.css:19` and `:24`) with:

```css
.vs-file, .vs-dir { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:0.9em; line-height:1.8; }
.vs-file .vs-name, .vs-dir .vs-name { font-size:1em; }
.vs-file-link { color:inherit; text-decoration:none; border-bottom:1px dotted var(--ctx); }
.vs-file-link:hover { color:#1a56db; border-bottom-style:solid; }
.vs-badge { font-size:0.8em; margin-left:6px; font-variant-numeric:tabular-nums; }
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npm test -- file-tree assemble && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderers/file-tree.ts src/assemble.ts assets/template.css test/file-tree.test.ts test/assemble.test.ts
git commit -m "feat: clickable file-tree filenames linking to their diffs + typography cleanup"
```

---

### Task 5: Mechanical importance ordering of diffs

**Files:**
- Create: `src/diff-order.ts`
- Modify: `src/gather-recap.ts`
- Create: `test/diff-order.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/diff-order.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sortByImportance } from "../src/diff-order.js";
import type { DiffBlock } from "../src/blocks.js";

const d = (path: string): DiffBlock => ({
  type: "diff", id: path, title: path, path, hunks: [],
});

describe("sortByImportance", () => {
  it("orders source before styles, tests, and lockfiles; stable within a rank", () => {
    const input = [
      d("app.css"),
      d("package-lock.json"),
      d("src/a.test.ts"),
      d("src/server/router.ts"),
      d("prisma/schema.prisma"),
      d("src/server/service.ts"),
    ];
    const out = sortByImportance(input).map((b) => b.path);
    expect(out).toEqual([
      "src/server/router.ts",   // source
      "src/server/service.ts",  // source (stable: keeps input order vs router)
      "prisma/schema.prisma",   // schema/config
      "app.css",                // styles
      "src/a.test.ts",          // tests
      "package-lock.json",      // lockfiles/generated
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- diff-order`
Expected: FAIL — `src/diff-order.ts` does not exist.

- [ ] **Step 3: Implement `src/diff-order.ts`**

```ts
import type { DiffBlock } from "./blocks.js";

// Lower rank = more important = sorted earlier. Ties keep input order (stable sort).
function rank(path: string): number {
  const p = path.toLowerCase();
  const base = p.split("/").pop() ?? p;
  if (/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(p) || /\.(snap|lock)$/.test(base)) return 5; // lockfiles/generated
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(base) || /(^|\/)(__tests__|tests?)\//.test(p)) return 4;             // tests
  if (/\.(css|scss|sass|less|styl)$/.test(base)) return 3;                                                      // styles
  if (/\.(prisma|sql|json|ya?ml|toml|env|config\.[cm]?[jt]s)$/.test(base) || /(^|\/)(prisma|config)\//.test(p)) return 2; // schema/config
  if (/\.([cm]?[jt]sx?|go|rs|py|rb|java|kt|php|swift)$/.test(base)) return 0;                                   // source code
  return 1; // everything else (docs, assets) sits just after source
}

/** Stable importance sort: source → schema/config → styles → tests → lockfiles/generated. */
export function sortByImportance<T extends DiffBlock>(blocks: T[]): T[] {
  return blocks
    .map((b, i) => ({ b, i }))
    .sort((x, y) => rank(x.b.path) - rank(y.b.path) || x.i - y.i)
    .map((e) => e.b);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- diff-order`
Expected: PASS.

- [ ] **Step 5: Wire into `src/gather-recap.ts`**

Add the import after `src/gather-recap.ts:9`:

```ts
import { sortByImportance } from "./diff-order.js";
```

Replace the diff-emitting loop (currently `src/gather-recap.ts:59`) with:

```ts
  for (const diff of sortByImportance(parseUnifiedDiff(scope.unifiedDiff))) blocks.push(diff);
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -- diff-order gather-recap recap-emit-blocks && npm run typecheck`
Expected: PASS (existing recap tests still pass — ordering of the sample single-file diff is unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/diff-order.ts src/gather-recap.ts test/diff-order.test.ts
git commit -m "feat: order bare-recap diffs by importance (source before styles/tests/lockfiles)"
```

---

## Phase 3 — Colors & legend

### Task 6: Dark ink text on every palette role

**Files:**
- Modify: `src/diagram-colors.ts`
- Modify: `test/diagram-colors.test.ts`
- Modify: `skills/shared/diagrams.md` (sync the classDef reference snippet)

- [ ] **Step 1: Write the failing test**

Add to `test/diagram-colors.test.ts` inside `describe("diagram colors", ...)`:

```ts
  it("sets a dark ink font color on every role in both representations (readable text)", () => {
    // d2 classes use font-color; mermaid classDefs use color
    expect((D2_CLASS_PRELUDE.match(/font-color:\s*"#1b1b1b"/g) || []).length)
      .toBe(Object.keys(PALETTE).length);
    expect((MERMAID_CLASSDEFS.match(/color:#1b1b1b/g) || []).length)
      .toBe(Object.keys(PALETTE).length);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- diagram-colors`
Expected: FAIL — no `font-color`/`color:#1b1b1b` yet.

- [ ] **Step 3: Add the ink color in `src/diagram-colors.ts`**

Add a constant after the `PALETTE` declaration (after `src/diagram-colors.ts:13`):

```ts
/** Dark ink for diagram label text — guarantees readable contrast on every role's fill. */
export const INK = "#1b1b1b";
```

Change the `D2_CLASS_PRELUDE` role mapper (the `return` inside `.map`, `src/diagram-colors.ts:23`) to:

```ts
    return `  ${r}: { style: { fill: "${fill}"; stroke: "${stroke}"; font-color: "${INK}"${sw} } }`;
```

Change the `MERMAID_CLASSDEFS` role mapper (the `return` inside `.map`, `src/diagram-colors.ts:33`) to:

```ts
  return `classDef ${r} fill:${fill},stroke:${stroke},color:${INK}${sw};`;
```

- [ ] **Step 4: Sync the catalog classDef reference in `skills/shared/diagrams.md`**

The drift guard (`test/diagram-catalog.test.ts`) only checks the `fill:..,stroke:..` substring, which still matches. For consistency, update the catalog's mermaid classDef reference lines so each ends with `,color:#1b1b1b` before the trailing `;` (find the "Color vocabulary" section's `classDef <role> fill:...,stroke:...;` lines and append `,color:#1b1b1b`). Example transform:

```
classDef changed fill:#ffd43b,stroke:#f08c00,stroke-width:2px;
->
classDef changed fill:#ffd43b,stroke:#f08c00,color:#1b1b1b,stroke-width:2px;
```

Apply the same `,color:#1b1b1b` insertion to every `classDef` line in that section.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- diagram-colors diagram-catalog && npm run typecheck`
Expected: PASS — including the existing "renders the role's fill" render test (fill hex unchanged) and the drift guard.

- [ ] **Step 6: Commit**

```bash
git add src/diagram-colors.ts test/diagram-colors.test.ts skills/shared/diagrams.md
git commit -m "feat: readable dark ink text on every semantic diagram color"
```

---

### Task 7: Auto-derived color legend on colored diagrams

**Files:**
- Modify: `src/diagram-colors.ts` (add `ROLE_LABELS`, `rolesInSource`)
- Create: `src/renderers/legend.ts`
- Modify: `src/assemble.ts` (compute roles, attach legend under each diagram)
- Modify: `assets/template.css`
- Create: `test/legend.test.ts`
- Modify: `test/assemble.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/legend.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- legend`
Expected: FAIL — `rolesInSource`/`renderLegend` do not exist.

- [ ] **Step 3: Add `ROLE_LABELS` and `rolesInSource` to `src/diagram-colors.ts`**

Append:

```ts
/** Human-readable legend labels per role. */
export const ROLE_LABELS: Record<ColorRole, string> = {
  changed: "Changed",
  added: "Added",
  removed: "Removed",
  actor: "Actor",
  external: "External",
  store: "Datastore",
};

/** Detect which palette roles a diagram APPLIES (not merely defines), so a legend can list
 *  only the roles actually used. Scans d2 (`class: role`) and mermaid (`x:::role`, `class a,b role;`),
 *  excluding mermaid `classDef role` definitions. Returns roles in canonical PALETTE order. */
export function rolesInSource(d2?: string, mermaid?: string): ColorRole[] {
  const found = new Set<string>();
  const add = (name: string) => { if ((ROLES as string[]).includes(name)) found.add(name); };
  const scan = (src?: string) => {
    if (!src) return;
    let m: RegExpExecArray | null;
    const reD2 = /class:\s*([a-zA-Z]+)/g;                 // d2: `class: changed`
    while ((m = reD2.exec(src))) add(m[1]);
    const reTriple = /:::([a-zA-Z]+)/g;                   // mermaid: `node:::changed`
    while ((m = reTriple.exec(src))) add(m[1]);
    const reClass = /(?<!Def)\bclass\s+[^\n]+?\s+([a-zA-Z]+)\s*;?\s*$/gm; // mermaid: `class a,b changed;` (not classDef)
    while ((m = reClass.exec(src))) add(m[1]);
  };
  scan(d2);
  scan(mermaid);
  return ROLES.filter((r) => found.has(r));
}
```

Note: `ROLES` is already declared in this file (`src/diagram-colors.ts:15`); no change needed there.

- [ ] **Step 4: Create `src/renderers/legend.ts`**

```ts
import { escapeHtml } from "../html.js";
import { PALETTE, ROLE_LABELS, type ColorRole } from "../diagram-colors.js";

/** Render a compact color legend for the roles a diagram uses. Empty string when none.
 *  Swatch colors are trusted palette data (never user input), so inline style is safe. */
export function renderLegend(roles: ColorRole[]): string {
  if (!roles.length) return "";
  const items = roles
    .map((r) => {
      const { fill, stroke } = PALETTE[r];
      return (
        `<li class="vs-legend-item">` +
        `<span class="vs-legend-swatch" style="background:${fill};border-color:${stroke}"></span>` +
        `${escapeHtml(ROLE_LABELS[r])}</li>`
      );
    })
    .join("");
  return `<ul class="vs-legend">${items}</ul>`;
}
```

- [ ] **Step 5: Attach the legend in `src/assemble.ts`**

Add imports (after the existing `renderAll` import, `src/assemble.ts:7`):

```ts
import { rolesInSource } from "./diagram-colors.js";
import { renderLegend } from "./renderers/legend.js";
```

Change `diagramInner` to accept a legend fragment — replace the version from Task 1 with:

```ts
  const diagramInner = (r: (typeof rendered)[number], legendHtml = ""): string => {
    const link = r.editable
      ? `<div class="vs-edit"><a href="${escapeHtml(basename(r.editable))}">open in Excalidraw</a></div>`
      : "";
    return `<div class="vs-zoomable">${r.svg}</div>${legendHtml}${link}`;
  };
```

Add a small helper just above `renderBlock` (before `src/assemble.ts:82`) that derives a legend for a diagram/schema block:

```ts
  const legendFor = (b: import("./blocks.js").DiagramBlock | import("./blocks.js").SchemaBlock): string =>
    renderLegend(rolesInSource(b.d2, "mermaid" in b ? b.mermaid : undefined));
```

Pass legends at the three diagram call sites:

- In `case "diagram"`/`case "schema"` (`src/assemble.ts:89`) change `${diagramInner(r)}` to `${diagramInner(r, legendFor(b))}`.
- In `case "diff"` single-diagram branch (`src/assemble.ts:97`) change `${diagramInner(svgById.get(b.diagram.id)!)}` to `${diagramInner(svgById.get(b.diagram.id)!, legendFor(b.diagram))}`.
- In `case "overview"` single-diagram branch (`src/assemble.ts:109`) change `${diagramInner(svgById.get(b.diagram.id)!)}` to `${diagramInner(svgById.get(b.diagram.id)!, legendFor(b.diagram))}`.

(Diagrams inside `tabs` are rendered through `renderBlock`'s `case "diagram"`, so they pick up the legend automatically.)

- [ ] **Step 6: Add an assemble-level legend test**

Add to `test/assemble.test.ts` inside `describe("assemble", ...)`:

```ts
  it("renders a legend under a diagram that applies roles, and none for a plain diagram", async () => {
    const colored = await assemble(
      [{ type: "diagram", id: "c", title: "C", kind: "flowchart", d2: "x: { class: changed }" }],
      { title: "T", source: "s" });
    expect(colored).toContain('class="vs-legend"');
    expect(colored).toContain("Changed");

    const plain = await assemble(
      [{ type: "diagram", id: "p", title: "P", kind: "flowchart", d2: "a -> b" }],
      { title: "T", source: "s" });
    expect(plain).not.toContain('class="vs-legend"');
  }, 30_000);
```

- [ ] **Step 7: Add legend styles to `assets/template.css`**

Append:

```css
/* ── diagram color legend ─────────────────────────────────────────────────────── */
.vs-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; list-style: none;
  margin: 8px 0 0; padding: 8px 0 0; border-top: 1px dashed var(--line);
  font-size: 0.82em; color: var(--ctx); }
.vs-legend-item { display: inline-flex; align-items: center; gap: 6px; }
.vs-legend-swatch { display: inline-block; width: 14px; height: 14px;
  border-radius: 3px; border: 1.5px solid; }
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npm test -- legend assemble diagram-colors && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/diagram-colors.ts src/renderers/legend.ts src/assemble.ts assets/template.css test/legend.test.ts test/assemble.test.ts
git commit -m "feat: auto-derived color legend on diagrams that apply semantic roles"
```

---

## Phase 4 — Summary & guidance

### Task 8: Overview points link a keyword, not the whole bullet

**Files:**
- Modify: `src/renderers/overview.ts`
- Modify: `assets/template.css`
- Modify: `test/overview.test.ts`

- [ ] **Step 1: Write the failing test**

In `test/overview.test.ts`, replace the test `"links a point with a safe #fragment href, renders inline code, leaves no-href plain"` (lines 23–28) with:

```ts
  it("appends a trailing arrow link for an href (not a whole-bullet wrap), renders inline code, leaves no-href plain", async () => {
    const html = await renderOverview(base);
    expect(html).toContain('class="vs-point-link" href="#diff-0"'); // trailing link, not the whole li
    expect(html).toContain("→");                               // the arrow glyph
    expect(html).toContain("<code>capture</code>");
    expect(html).toContain("<li>no link here</li>");
  });

  it("uses the author's inline markdown link and adds NO trailing arrow when text already links", async () => {
    const html = await renderOverview({
      type: "overview", id: "ov2", headline: "H",
      points: [{ text: "see the [router](#diff-3)", href: "#diff-0" }],
    });
    expect(html).toContain('href="#diff-3"');     // author's inline link is used
    expect(html).not.toContain('href="#diff-0"'); // no redundant trailing arrow
    expect(html).not.toContain("vs-point-link");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- overview`
Expected: FAIL — current code wraps the whole bullet (`<a href="#diff-0">...`), so `vs-point-link`/arrow assertions fail.

- [ ] **Step 3: Implement keyword linking in `src/renderers/overview.ts`**

Replace the `.map` callback in `renderOverview` (currently `src/renderers/overview.ts:14-22`) with:

```ts
  const items = await Promise.all(
    block.points.map(async (p) => {
      const inner = await renderInlineMarkdown(p.text);
      // Author can link a keyword inline via markdown. If they didn't and an href is given,
      // append a small trailing arrow link instead of wrapping the entire bullet.
      const body =
        p.href && SAFE_HREF.test(p.href) && !/<a[\s>]/i.test(inner)
          ? `${inner} <a class="vs-point-link" href="${escapeHtml(p.href)}">→</a>`
          : inner;
      return `<li>${body}</li>`;
    }),
  );
```

- [ ] **Step 4: Add the point-link style to `assets/template.css`**

Append:

```css
.vs-point-link { text-decoration: none; color: #7c5cff; font-weight: 700; }
.vs-point-link:hover { text-decoration: underline; }
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- overview && npm run typecheck`
Expected: PASS. The headline test, the no-href-plain assertion, and the unsafe-`javascript:` test (no trailing link is added because `SAFE_HREF` fails → renders `<li>bad link</li>`) all still hold.

- [ ] **Step 6: Commit**

```bash
git add src/renderers/overview.ts assets/template.css test/overview.test.ts
git commit -m "feat: overview points link a keyword (or trailing arrow), not the whole bullet"
```

---

### Task 9: Skill & catalog authoring guidance

**Files:**
- Modify: `skills/visual-recap/SKILL.md`
- Modify: `skills/visual-plan/SKILL.md`
- Modify: `skills/shared/diagrams.md`

This task is documentation only — no code. Run `npm test -- skill-docs` at the end to confirm the block-coverage test still passes (no new block `type` literals were introduced — `description` is a field, not a type).

- [ ] **Step 1: Update `skills/visual-recap/SKILL.md` — ordering within groups**

In step 5 ("Order and group the diffs", `skills/visual-recap/SKILL.md:116`), add after the existing narrative-order sentence:

```
   Within each group, order the diffs **most-important-first** (the core logic change before
   its supporting wiring; styles, tests, config, and lockfiles last). The bare CLI already
   applies this ordering heuristically, but when you regroup, preserve importance order inside
   each group — never lead a group with a stylesheet or test file.
```

- [ ] **Step 2: Update `skills/visual-recap/SKILL.md` — scannable + optional descriptions**

In step 4 ("Annotate each diff", `skills/visual-recap/SKILL.md:91`), replace the paragraph with:

```
4. **Annotate each diff — scannably, and only when it helps.** Set a diff block's
   `description` (markdown) to *what changes and why*. Keep it scannable: short sub-points,
   bullet lists, inline `code`, and a small diagram when a picture beats prose — never a wall
   of text. **Omit the description entirely for trivial one-line changes** where it would add
   nothing. Cross-link related diffs by id, e.g. `See [the router](#diff-3).` (each block
   renders with `id="<its id>"`, so `#diff-3` jumps to that diff). The diff's code hunks are
   collapsed by default under a "View changes" toggle, so the title + description + any diagram
   are what the reader scans first — make them carry the meaning.
```

- [ ] **Step 3: Update `skills/visual-recap/SKILL.md` — group descriptions**

In step 5, after the `group` block shape sentence, add:

```
   Give each group a `description` (markdown) — one or two scannable lines on what the group
   covers and why it matters — e.g.
   `{ "type":"group", "id":"core", "title":"Core change", "description":"The capture mutation and its wiring.", "blocks":[ … ] }`.
```

- [ ] **Step 4: Update `skills/visual-recap/SKILL.md` — overview keyword links**

In step 3's `points` bullet (`skills/visual-recap/SKILL.md:84-85`), replace the `points` guidance line with:

```
   - `points`: 3–6 SHORT items. Link a **keyword** inline with markdown to its detail section,
     e.g. `new \`capture\` mutation on the [order router](#diff-0)` — do NOT rely on a bare
     `href` that turns the whole bullet into one link (a keyword link reads far better).
```

- [ ] **Step 5: Update `skills/shared/diagrams.md` — legend note**

In the "Color vocabulary" section, after the role table, add:

```
A compact legend is rendered automatically beneath any diagram that applies these roles
(listing only the roles used), so you don't need to author one — just apply the classes.
```

- [ ] **Step 6: Update `skills/visual-plan/SKILL.md` — group description**

In the `group` block-mapping bullet, note the optional `description` field:

```
- `group` — a titled, collapsible set of related blocks; add an optional `description`
  (markdown) summarizing what the group covers.
```

- [ ] **Step 7: Run the docs test**

Run: `npm test -- skill-docs`
Expected: PASS (block-coverage unchanged — no new type literals).

- [ ] **Step 8: Commit**

```bash
git add skills/visual-recap/SKILL.md skills/visual-plan/SKILL.md skills/shared/diagrams.md
git commit -m "docs: authoring guidance for ordering, scannable/optional descriptions, keyword links, legend, group descriptions"
```

---

## Final verification

- [ ] Run the full suite: `npm test`
  Expected: all green.
- [ ] Typecheck: `npm run typecheck`
  Expected: no errors.
- [ ] Dispatch a final holistic code review across the whole implementation.
- [ ] Smoke-test on a real recap (optional, manual): regenerate `ppgl/.recaps/pr-195` and open the HTML — verify zoom overlay, collapsed diffs, clickable file tree, readable colors + legend, keyword-linked summary, group descriptions.
