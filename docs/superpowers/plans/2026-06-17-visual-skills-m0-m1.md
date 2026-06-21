# Visual Skills — M0 (floor) + M1 (recap gatherer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted renderer that turns a block array (hand-authored, or gathered from a git diff) into a single self-contained, hand-drawn-styled HTML document grounded in the real repo.

**Architecture:** A typed `Block[]` flows through one diagram renderer (`d2 --sketch` → inline SVG) plus pure `string → HTML` renderers, then an assembler wraps them into one offline HTML file. Two CLIs feed the same pipeline: `bin/plan.ts` (hand-authored blocks) and `bin/recap.ts` (blocks gathered from a git target via a pluggable `StackAdapter`, with a Prisma+tRPC adapter shipped first).

**Tech Stack:** TypeScript run via tsx, vitest, `marked` (markdown→HTML), the `d2` binary (sketch SVG), `git`/`gh` (scope), TypeScript compiler API (tRPC structural parse). No browser, no view-time JS.

---

## File Structure

```
visual-skills/
  package.json, tsconfig.json, vitest.config.ts
  bin/{plan.ts, recap.ts}
  src/
    blocks.ts                      # Block union types
    html.ts                        # escapeHtml + tiny helpers
    render-diagram.ts              # D2 floor (port of reference/render-diagram.mjs); Excalidraw dormant
    assemble.ts                    # Block[] + rendered diagrams -> one HTML file
    renderers/{prose.ts, file-tree.ts, diff.ts, api.ts}
    git.ts                         # scope resolution + git plumbing
    gather-recap.ts                # git target -> Block[]
    adapters/{stack-adapter.ts, generic.ts, prisma-trpc.ts}
    prisma-schema.ts               # parse + diff schema.prisma
    trpc-parse.ts                  # parse tRPC routers via TS compiler API
  assets/{template.css, excalifont.woff2?}
  test/                            # vitest specs + fixtures
```

Each file has one responsibility. Parsers (`prisma-schema.ts`, `trpc-parse.ts`) are pure and independently testable. Renderers are pure `data → HTML string`. `git.ts` is the only place that shells out to git.

---

## Task 1: Project scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/html.ts`, `test/html.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "visual-skills",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "visual-plan": "bin/plan.ts",
    "visual-recap": "bin/recap.ts"
  },
  "scripts": {
    "plan": "tsx bin/plan.ts",
    "recap": "tsx bin/recap.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "marked": "^14.1.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "tsx": "^4.21.0",
    "typescript": "^5.6.0",
    "vitest": "^4.1.4"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowJs": true,
    "types": ["node"]
  },
  "include": ["src", "bin", "test"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
});
```

- [ ] **Step 4: Install deps and the d2 binary**

Run:
```bash
cd ~/Projects/visual-skills && npm install && (which d2 || brew install d2)
```
Expected: `node_modules/` populated; `which d2` prints a path (e.g. `/opt/homebrew/bin/d2`). `d2` is the required rendering floor — do not proceed without it.

- [ ] **Step 5: Write the failing test for `escapeHtml`**

`test/html.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { escapeHtml } from "../src/html.js";

describe("escapeHtml", () => {
  it("escapes the five XML-significant characters", () => {
    expect(escapeHtml(`<a href="x" & 'y'>`)).toBe(
      "&lt;a href=&quot;x&quot; &amp; &#39;y&#39;&gt;",
    );
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run test/html.test.ts`
Expected: FAIL — cannot resolve `../src/html.js`.

- [ ] **Step 7: Implement `src/html.ts`**

```ts
/** Escape text for safe inclusion in HTML element/attribute content. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run test/html.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts src/html.ts test/html.test.ts package-lock.json
git commit -m "chore: scaffold visual-skills project + escapeHtml util"
```

---

## Task 2: Block model

**Files:**
- Create: `src/blocks.ts`, `test/blocks.test.ts`

- [ ] **Step 1: Write the failing type-guard test**

`test/blocks.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isDiagramBlock, type Block } from "../src/blocks.js";

describe("block model", () => {
  it("recognizes diagram blocks (diagram + schema)", () => {
    const diagram: Block = { type: "diagram", id: "a", title: "A", kind: "flowchart", d2: "x -> y" };
    const schema: Block = { type: "schema", id: "s", title: "S", kind: "erd", d2: "T: {shape: sql_table}" };
    const prose: Block = { type: "prose", id: "p", markdown: "hi" };
    expect(isDiagramBlock(diagram)).toBe(true);
    expect(isDiagramBlock(schema)).toBe(true);
    expect(isDiagramBlock(prose)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/blocks.test.ts`
Expected: FAIL — cannot resolve `../src/blocks.js`.

- [ ] **Step 3: Implement `src/blocks.ts`**

```ts
export type DiagramKind = "flowchart" | "architecture" | "sequence" | "erd" | "class";

export interface DiagramBlock {
  type: "diagram";
  id: string;
  title: string;
  kind: DiagramKind;
  d2: string;            // REQUIRED — the floor + fallback
  mermaid?: string;      // OPTIONAL — only for editable-eligible kinds (dormant this slice)
}

export interface SchemaBlock {
  type: "schema";
  id: string;
  title: string;
  kind: "erd";
  d2: string;            // ERD rendered via D2
}

export interface ApiProcedure {
  name: string;          // e.g. "league.captureOrder"
  auth: "public" | "protected" | "unknown";
  kind: "query" | "mutation" | "subscription" | "unknown";
  input: string;         // source text of the .input(...) argument, or "" if none
  change?: "added" | "removed" | "changed";
}

export interface ApiBlock {
  type: "api";
  id: string;
  title: string;
  procedures: ApiProcedure[];
}

export interface FileChange {
  path: string;
  status: "A" | "M" | "D" | "R";
  added: number;
  deleted: number;
}

export interface FileTreeBlock {
  type: "file-tree";
  id: string;
  title: string;
  files: FileChange[];
}

export interface DiffHunk {
  header: string;        // the @@ line
  lines: string[];       // raw diff lines incl. leading +/-/space
  annotation?: string;   // optional agent prose (empty in this slice)
}

export interface DiffBlock {
  type: "diff";
  id: string;
  title: string;
  path: string;
  hunks: DiffHunk[];
}

export interface ProseBlock {
  type: "prose";
  id: string;
  markdown: string;
  title?: string;
}

// Types defined now; renderers deferred to M2. Rendering them throws.
export interface AnnotatedCodeBlock {
  type: "annotated-code";
  id: string;
  title: string;
  lang: string;
  code: string;
  annotations: { line: number; note: string }[];
}

export interface QuestionsBlock {
  type: "questions";
  id: string;
  title: string;
  questions: { question: string; recommendedDefault: string }[];
}

export type Block =
  | DiagramBlock
  | SchemaBlock
  | ApiBlock
  | FileTreeBlock
  | DiffBlock
  | ProseBlock
  | AnnotatedCodeBlock
  | QuestionsBlock;

/** Blocks rendered through the D2 diagram renderer. */
export function isDiagramBlock(b: Block): b is DiagramBlock | SchemaBlock {
  return b.type === "diagram" || b.type === "schema";
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/blocks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/blocks.ts test/blocks.test.ts
git commit -m "feat: typed block model for plan/recap documents"
```

---

## Task 3: D2 diagram renderer (port of provided renderer)

**Files:**
- Create: `src/render-diagram.ts`, `test/render-diagram.test.ts`
- Reference: `reference/render-diagram.mjs` (adapt, don't rewrite the logic)

- [ ] **Step 1: Write the failing test (requires `d2` on PATH)**

`test/render-diagram.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { renderDiagram } from "../src/render-diagram.js";
import type { DiagramBlock } from "../src/blocks.js";

describe("renderDiagram (D2 floor)", () => {
  it("compiles a flowchart block to sketch SVG", async () => {
    const block: DiagramBlock = {
      type: "diagram", id: "flow", title: "Flow", kind: "flowchart",
      d2: "spec -> blocks -> html",
    };
    const out = await renderDiagram(block, { excalidraw: false });
    expect(out.renderer).toBe("d2");
    expect(out.svg).toMatch(/<svg/);
    expect(out.editable).toBeNull();
    expect(out.id).toBe("flow");
  });

  it("throws when a diagram block has no d2 source", async () => {
    // @ts-expect-error intentionally missing d2
    await expect(renderDiagram({ type: "diagram", id: "x", title: "x", kind: "flowchart" }, {}))
      .rejects.toThrow(/d2 source/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/render-diagram.test.ts`
Expected: FAIL — cannot resolve `../src/render-diagram.js`.

- [ ] **Step 3: Port the provided renderer to TypeScript**

Create `src/render-diagram.ts` by porting `reference/render-diagram.mjs`: keep the logic and comments, add types, and accept our block types. The Excalidraw upgrade path is retained but stays dormant (its `excalidrawReady()` access check fails when `assets/excalidraw-bundle.html` / playwright are absent, so it always falls back to D2).

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, mkdtemp, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DiagramBlock, SchemaBlock } from "./blocks.js";

const exec = promisify(execFile);

export interface DiagramResult {
  id: string;
  title: string;
  svg: string;
  editable: string | null;
  renderer: "d2" | "excalidraw";
}

export interface RenderOpts {
  outDir?: string;
  excalidraw?: boolean;
  onWarn?: (msg: string) => void;
}

// Kinds mermaid-to-excalidraw turns into native editable elements. Conservative
// on purpose — anything not here goes to D2. (Dormant this slice.)
const EXCALIDRAW_EDITABLE = new Set<string>(["flowchart", "architecture"]);
const EXCALIDRAW_PAGE = join(import.meta.dirname ?? ".", "..", "assets", "excalidraw-bundle.html");

/** Render a single diagram/schema block. Always produces a D2 sketch SVG floor. */
export async function renderDiagram(
  block: DiagramBlock | SchemaBlock,
  opts: RenderOpts = {},
): Promise<DiagramResult> {
  const { id, title, kind, d2 } = block;
  const mermaid = "mermaid" in block ? block.mermaid : undefined;
  if (!d2) throw new Error(`block "${id}": every diagram block needs a d2 source (the floor)`);

  // 1. Floor: always compile the D2 sketch SVG. Guaranteed, no browser.
  const d2Svg = await renderViaD2(d2);

  // 2. Upgrade: editable Excalidraw, only when eligible + toolchain present (dormant).
  const eligible = !!mermaid && EXCALIDRAW_EDITABLE.has(kind) && opts.excalidraw !== false;
  if (eligible && (await excalidrawReady())) {
    try {
      const { svg, scene } = await renderViaExcalidraw(mermaid!);
      const editFile = join(opts.outDir ?? ".", `${id}.excalidraw`);
      await writeFile(editFile, JSON.stringify(scene, null, 2));
      return { id, title, svg, editable: editFile, renderer: "excalidraw" };
    } catch (err) {
      opts.onWarn?.(`block "${id}": excalidraw failed (${(err as Error).message}); using d2`);
    }
  }
  return { id, title, svg: d2Svg, editable: null, renderer: "d2" };
}

/** Render many blocks, preserving order. */
export async function renderAll(
  blocks: (DiagramBlock | SchemaBlock)[],
  opts: RenderOpts = {},
): Promise<DiagramResult[]> {
  return Promise.all(blocks.map((b) => renderDiagram(b, opts)));
}

async function renderViaD2(source: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "d2-"));
  const inFile = join(dir, "in.d2");
  const outFile = join(dir, "out.svg");
  await writeFile(inFile, source);
  // --sketch = hand-drawn; theme 0 neutral; pad for breathing room.
  await exec("d2", ["--sketch", "--theme", "0", "--pad", "24", inFile, outFile]);
  return readFile(outFile, "utf8");
}

let _excalidrawCache: boolean | undefined;
async function excalidrawReady(): Promise<boolean> {
  if (_excalidrawCache !== undefined) return _excalidrawCache;
  try {
    await access(EXCALIDRAW_PAGE);
    await import("playwright" as string);
    _excalidrawCache = true;
  } catch {
    _excalidrawCache = false;
  }
  return _excalidrawCache;
}

async function renderViaExcalidraw(mermaidSource: string): Promise<{ svg: string; scene: unknown }> {
  const { chromium } = await import("playwright" as string);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto("file://" + EXCALIDRAW_PAGE);
    return await page.evaluate(async (src: string) => {
      const { parseMermaidToExcalidraw } = (window as any).MermaidToExcalidrawLib;
      const { convertToExcalidrawElements, exportToSvg } = (window as any).ExcalidrawLib;
      const { elements: skeleton, files } = await parseMermaidToExcalidraw(src, {
        themeVariables: { fontSize: "20px" },
      });
      const elements = convertToExcalidrawElements(skeleton);
      const scene = {
        type: "excalidraw", version: 2, source: "visual-skill",
        elements, appState: { viewBackgroundColor: "#ffffff", gridSize: null }, files: files ?? {},
      };
      const svgEl = await exportToSvg({
        elements, files: files ?? {},
        appState: { exportWithDarkMode: false, exportBackground: true, viewBackgroundColor: "#ffffff" },
      });
      return { svg: (svgEl as any).outerHTML, scene };
    }, mermaidSource);
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/render-diagram.test.ts`
Expected: PASS (both cases). If the SVG case errors with "d2: command not found", install d2 (Task 1 Step 4).

- [ ] **Step 5: Commit**

```bash
git add src/render-diagram.ts test/render-diagram.test.ts
git commit -m "feat: D2 sketch diagram renderer (Excalidraw upgrade dormant)"
```

---

## Task 4: Prose renderer

**Files:**
- Create: `src/renderers/prose.ts`, `test/prose.test.ts`

- [ ] **Step 1: Write the failing test**

`test/prose.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { renderProse } from "../src/renderers/prose.js";

describe("renderProse", () => {
  it("renders markdown to an HTML block fragment", () => {
    const html = renderProse({ type: "prose", id: "p", markdown: "# Hi\n\nSome **bold**." });
    expect(html).toContain("<h1");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('class="vs-block vs-prose"');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/prose.test.ts`
Expected: FAIL — cannot resolve `../src/renderers/prose.js`.

- [ ] **Step 3: Implement `src/renderers/prose.ts`**

```ts
import { marked } from "marked";
import type { ProseBlock } from "../blocks.js";

export function renderProse(block: ProseBlock): string {
  const body = marked.parse(block.markdown, { async: false }) as string;
  return `<section class="vs-block vs-prose">${body}</section>`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/prose.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/prose.ts test/prose.test.ts
git commit -m "feat: prose (markdown) renderer"
```

---

## Task 5: File-tree renderer

**Files:**
- Create: `src/renderers/file-tree.ts`, `test/file-tree.test.ts`

- [ ] **Step 1: Write the failing test**

`test/file-tree.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { renderFileTree } from "../src/renderers/file-tree.js";
import type { FileTreeBlock } from "../src/blocks.js";

describe("renderFileTree", () => {
  it("renders a nested tree with status markers and +/- badges", () => {
    const block: FileTreeBlock = {
      type: "file-tree", id: "ft", title: "Files",
      files: [
        { path: "src/lib/paypal.ts", status: "A", added: 174, deleted: 0 },
        { path: "src/lib/stripe.ts", status: "D", added: 0, deleted: 14 },
        { path: "prisma/schema.prisma", status: "M", added: 2, deleted: 2 },
      ],
    };
    const html = renderFileTree(block);
    expect(html).toContain('class="vs-block vs-file-tree"');
    expect(html).toContain("paypal.ts");
    expect(html).toContain("+174");
    expect(html).toContain("-14");
    expect(html).toContain('data-status="A"');
    expect(html).toContain('data-status="D"');
    // directories are grouped
    expect(html).toContain("src/lib");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/file-tree.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement `src/renderers/file-tree.ts`**

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

function renderNode(node: TreeNode): string {
  const items: string[] = [];
  for (const child of node.children.values()) {
    if (child.file) {
      const f = child.file;
      const badge =
        `<span class="vs-badge vs-add">+${f.added}</span>` +
        `<span class="vs-badge vs-del">-${f.deleted}</span>`;
      items.push(
        `<li class="vs-file" data-status="${f.status}">` +
          `<span class="vs-marker">${f.status}</span> ` +
          `<span class="vs-name">${escapeHtml(child.name)}</span> ${badge}</li>`,
      );
    } else {
      items.push(
        `<li class="vs-dir"><span class="vs-name">${escapeHtml(child.name)}</span>` +
          `<ul>${renderNode(child)}</ul></li>`,
      );
    }
  }
  return items.join("");
}

export function renderFileTree(block: FileTreeBlock): string {
  const tree = renderNode(buildTree(block.files));
  return (
    `<section class="vs-block vs-file-tree">` +
    `<h2>${escapeHtml(block.title)}</h2>` +
    `<ul class="vs-tree">${tree}</ul></section>`
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/file-tree.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/file-tree.ts test/file-tree.test.ts
git commit -m "feat: file-tree renderer with status markers and +/- badges"
```

---

## Task 6: Diff renderer (plain styled lines)

**Files:**
- Create: `src/renderers/diff.ts`, `test/diff.test.ts`

- [ ] **Step 1: Write the failing test**

`test/diff.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { renderDiff } from "../src/renderers/diff.js";
import type { DiffBlock } from "../src/blocks.js";

describe("renderDiff", () => {
  it("renders hunks with per-line add/del/context classes and escapes HTML", () => {
    const block: DiffBlock = {
      type: "diff", id: "d", title: "league.ts", path: "src/server/routers/league.ts",
      hunks: [{
        header: "@@ -56,6 +56,12 @@",
        lines: [
          "   createCheckoutSession(...)",
          "+  captureOrder: protectedProcedure",
          "-  old<line>",
        ],
        annotation: "Adds the server-side capture mutation.",
      }],
    };
    const html = renderDiff(block);
    expect(html).toContain('class="vs-block vs-diff"');
    expect(html).toContain('class="vs-line vs-add"');
    expect(html).toContain('class="vs-line vs-del"');
    expect(html).toContain('class="vs-line vs-ctx"');
    expect(html).toContain("&lt;line&gt;");               // escaped
    expect(html).toContain("Adds the server-side capture mutation.");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/diff.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement `src/renderers/diff.ts`**

```ts
import { escapeHtml } from "../html.js";
import type { DiffBlock, DiffHunk } from "../blocks.js";

function lineClass(line: string): "vs-add" | "vs-del" | "vs-ctx" {
  if (line.startsWith("+")) return "vs-add";
  if (line.startsWith("-")) return "vs-del";
  return "vs-ctx";
}

function renderHunk(hunk: DiffHunk): string {
  const lines = hunk.lines
    .map((l) => `<div class="vs-line ${lineClass(l)}">${escapeHtml(l)}</div>`)
    .join("");
  const annotation = hunk.annotation
    ? `<aside class="vs-annotation">${escapeHtml(hunk.annotation)}</aside>`
    : "";
  return (
    `<div class="vs-hunk">` +
    `<div class="vs-hunk-header">${escapeHtml(hunk.header)}</div>` +
    `<pre class="vs-hunk-body">${lines}</pre>${annotation}</div>`
  );
}

export function renderDiff(block: DiffBlock): string {
  return (
    `<section class="vs-block vs-diff">` +
    `<h2>${escapeHtml(block.title)}</h2>` +
    `<div class="vs-path">${escapeHtml(block.path)}</div>` +
    block.hunks.map(renderHunk).join("") +
    `</section>`
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/diff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/diff.ts test/diff.test.ts
git commit -m "feat: diff renderer with per-line classes and hunk annotations"
```

---

## Task 7: API (tRPC contract) renderer

**Files:**
- Create: `src/renderers/api.ts`, `test/api.test.ts`

- [ ] **Step 1: Write the failing test**

`test/api.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { renderApi } from "../src/renderers/api.js";
import type { ApiBlock } from "../src/blocks.js";

describe("renderApi", () => {
  it("renders a contract table with change classes", () => {
    const block: ApiBlock = {
      type: "api", id: "api", title: "tRPC changes",
      procedures: [
        { name: "league.captureOrder", auth: "protected", kind: "mutation", input: "{ leagueId: string; orderId: string }", change: "added" },
        { name: "league.createCheckoutSession", auth: "protected", kind: "mutation", input: "{ leagueId: string }", change: "changed" },
      ],
    };
    const html = renderApi(block);
    expect(html).toContain('class="vs-block vs-api"');
    expect(html).toContain("league.captureOrder");
    expect(html).toContain('data-change="added"');
    expect(html).toContain('data-change="changed"');
    expect(html).toContain("mutation");
    expect(html).toContain("protected");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/api.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement `src/renderers/api.ts`**

```ts
import { escapeHtml } from "../html.js";
import type { ApiBlock, ApiProcedure } from "../blocks.js";

function row(p: ApiProcedure): string {
  const change = p.change ?? "";
  return (
    `<tr data-change="${change}">` +
    `<td class="vs-proc">${escapeHtml(p.name)}</td>` +
    `<td>${escapeHtml(p.kind)}</td>` +
    `<td>${escapeHtml(p.auth)}</td>` +
    `<td><code>${escapeHtml(p.input || "—")}</code></td>` +
    `<td class="vs-change">${escapeHtml(change)}</td>` +
    `</tr>`
  );
}

export function renderApi(block: ApiBlock): string {
  const rows = block.procedures.map(row).join("");
  return (
    `<section class="vs-block vs-api">` +
    `<h2>${escapeHtml(block.title)}</h2>` +
    `<table class="vs-api-table"><thead><tr>` +
    `<th>Procedure</th><th>Kind</th><th>Auth</th><th>Input</th><th>Change</th>` +
    `</tr></thead><tbody>${rows}</tbody></table></section>`
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/api.ts test/api.test.ts
git commit -m "feat: tRPC API contract table renderer"
```

---

## Task 8: Assembler + template

**Files:**
- Create: `src/assemble.ts`, `assets/template.css`, `test/assemble.test.ts`

- [ ] **Step 1: Create `assets/template.css`**

```css
:root { --ink:#1b1b1b; --paper:#fbfaf7; --add:#1a7f37; --del:#cf222e; --ctx:#57606a; --line:#d8d4c8; }
* { box-sizing: border-box; }
body { margin:0; background:var(--paper); color:var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; line-height:1.5; }
@font-face { font-family:"Excalifont"; src:url("excalifont") format("woff2"); font-display:swap; }
.vs-doc { max-width: 900px; margin: 0 auto; padding: 32px; }
.vs-header { border-bottom: 2px dashed var(--line); margin-bottom: 24px; padding-bottom: 12px; }
.vs-header h1 { margin: 0 0 4px; }
.vs-source { color: var(--ctx); font-size: 0.9em; }
.vs-status { display:inline-block; padding:2px 10px; border-radius:12px; font-size:0.8em; }
.vs-status.green { background:#dafbe1; color:var(--add); }
.vs-status.yellow { background:#fff8c5; color:#9a6700; }
.vs-status.red { background:#ffebe9; color:var(--del); }
.vs-block { background:#fff; border:1.5px solid var(--line); border-radius:10px;
  padding:16px 20px; margin:20px 0; box-shadow: 2px 3px 0 rgba(0,0,0,0.04); }
.vs-block h2 { margin-top:0; }
.vs-diagram svg { max-width:100%; height:auto; }
.vs-diagram svg text { font-family:"Excalifont", "Comic Sans MS", cursive; }
.vs-tree, .vs-tree ul { list-style:none; padding-left:18px; }
.vs-file, .vs-dir { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:0.9em; }
.vs-marker { display:inline-block; width:1.2em; font-weight:bold; }
.vs-file[data-status="A"] .vs-marker { color:var(--add); }
.vs-file[data-status="D"] .vs-marker { color:var(--del); }
.vs-file[data-status="M"] .vs-marker { color:#9a6700; }
.vs-badge { font-size:0.75em; margin-left:4px; }
.vs-badge.vs-add { color:var(--add); } .vs-badge.vs-del { color:var(--del); }
.vs-hunk-header { color:var(--ctx); font-family:ui-monospace,monospace; font-size:0.85em; margin-top:8px; }
.vs-hunk-body { margin:0; overflow-x:auto; font-family:ui-monospace,monospace; font-size:0.85em; }
.vs-line { white-space:pre; padding:0 6px; }
.vs-line.vs-add { background:#e6ffec; } .vs-line.vs-del { background:#ffebe9; } .vs-line.vs-ctx { color:var(--ctx); }
.vs-annotation { border-left:3px solid #d4a72c; padding:6px 10px; margin-top:6px; background:#fffdf3; font-size:0.9em; }
.vs-path { color:var(--ctx); font-family:ui-monospace,monospace; font-size:0.85em; margin-bottom:6px; }
.vs-api-table { width:100%; border-collapse:collapse; font-size:0.9em; }
.vs-api-table th, .vs-api-table td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--line); }
.vs-api-table tr[data-change="added"] { background:#e6ffec; }
.vs-api-table tr[data-change="removed"] { background:#ffebe9; }
.vs-api-table tr[data-change="changed"] { background:#fffdf3; }
.vs-proc { font-family:ui-monospace,monospace; }
```

- [ ] **Step 2: Write the failing assembler test**

`test/assemble.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { assemble } from "../src/assemble.js";
import type { Block } from "../src/blocks.js";

describe("assemble", () => {
  it("produces one self-contained HTML doc with inlined CSS, header, and rendered blocks", async () => {
    const blocks: Block[] = [
      { type: "prose", id: "p", markdown: "Intro **text**." },
      { type: "diagram", id: "flow", title: "Flow", kind: "flowchart", d2: "a -> b" },
    ];
    const html = await assemble(blocks, {
      title: "Test Plan", source: "spec.md", status: { level: "green", text: "ready" },
    });
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain("<style>");         // CSS inlined, not linked
    expect(html).not.toContain("<link");
    expect(html).toContain("Test Plan");
    expect(html).toContain("spec.md");
    expect(html).toContain('class="vs-status green"');
    expect(html).toContain("<strong>text</strong>");
    expect(html).toContain("<svg");             // diagram inlined
    expect(html).not.toContain("<script");      // no view-time JS
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run test/assemble.test.ts`
Expected: FAIL — cannot resolve `../src/assemble.js`.

- [ ] **Step 4: Implement `src/assemble.ts`**

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Block } from "./blocks.js";
import { isDiagramBlock } from "./blocks.js";
import { escapeHtml } from "./html.js";
import { renderAll } from "./render-diagram.js";
import { renderProse } from "./renderers/prose.js";
import { renderFileTree } from "./renderers/file-tree.js";
import { renderDiff } from "./renderers/diff.js";
import { renderApi } from "./renderers/api.js";

export interface DocStatus { level: "green" | "yellow" | "red"; text: string; }
export interface AssembleOpts {
  title: string;
  source: string;
  status?: DocStatus;
  outDir?: string;
  excalidraw?: boolean;
  onWarn?: (msg: string) => void;
}

const ASSETS = join(import.meta.dirname ?? ".", "..", "assets");

export async function assemble(blocks: Block[], opts: AssembleOpts): Promise<string> {
  // Render every diagram/schema block to inline SVG up front (preserves order by id).
  const diagramBlocks = blocks.filter(isDiagramBlock);
  const rendered = await renderAll(diagramBlocks, {
    outDir: opts.outDir, excalidraw: opts.excalidraw, onWarn: opts.onWarn,
  });
  const svgById = new Map(rendered.map((r) => [r.id, r]));

  const fragments = blocks.map((b) => {
    switch (b.type) {
      case "diagram":
      case "schema": {
        const r = svgById.get(b.id)!;
        const link = r.editable
          ? `<div class="vs-edit"><a href="${escapeHtml(r.editable)}">open in Excalidraw</a></div>`
          : "";
        return `<section class="vs-block vs-diagram"><h2>${escapeHtml(b.title)}</h2>${r.svg}${link}</section>`;
      }
      case "prose": return renderProse(b);
      case "file-tree": return renderFileTree(b);
      case "diff": return renderDiff(b);
      case "api": return renderApi(b);
      case "annotated-code":
      case "questions":
        throw new Error(`block "${b.id}": renderer for "${b.type}" is not implemented in this slice (M2)`);
    }
  });

  const css = await readFile(join(ASSETS, "template.css"), "utf8");
  const status = opts.status
    ? `<span class="vs-status ${opts.status.level}">${escapeHtml(opts.status.text)}</span>`
    : "";
  const header =
    `<header class="vs-header"><h1>${escapeHtml(opts.title)}</h1>` +
    `<div class="vs-source">${escapeHtml(opts.source)}</div>${status}</header>`;

  return (
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${escapeHtml(opts.title)}</title><style>${css}</style></head>` +
    `<body><main class="vs-doc">${header}${fragments.join("")}</main></body></html>\n`
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run test/assemble.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/assemble.ts assets/template.css test/assemble.test.ts
git commit -m "feat: HTML assembler + sketch template (self-contained, no view-time JS)"
```

---

## Task 9: `bin/plan.ts` CLI + M0 end-to-end acceptance

**Files:**
- Create: `bin/plan.ts`, `test/fixtures/sample-plan.blocks.json`, `test/plan-cli.test.ts`

- [ ] **Step 1: Create the fixture block array**

`test/fixtures/sample-plan.blocks.json`:
```json
[
  { "type": "prose", "id": "intro", "markdown": "# Sample Plan\n\nGrounded demo." },
  { "type": "diagram", "id": "arch", "title": "Architecture", "kind": "flowchart",
    "d2": "spec -> blocks -> renderer -> html" },
  { "type": "schema", "id": "erd", "title": "Data model", "kind": "erd",
    "d2": "League: {\n  shape: sql_table\n  id: String\n  paymentSessionId: String?\n}" }
]
```

- [ ] **Step 2: Write the failing CLI test**

`test/plan-cli.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const exec = promisify(execFile);

describe("bin/plan.ts", () => {
  it("renders a hand-authored block array to a self-contained plan.html", async () => {
    const out = await mkdtemp(join(tmpdir(), "plan-"));
    try {
      await exec("npx", ["tsx", "bin/plan.ts",
        "--blocks", "test/fixtures/sample-plan.blocks.json",
        "--title", "Sample Plan", "--out", join(out, "plan.html")]);
      const html = await readFile(join(out, "plan.html"), "utf8");
      expect(html).toMatch(/^<!doctype html>/i);
      expect(html).toContain("Sample Plan");
      expect(html.match(/<svg/g)?.length).toBeGreaterThanOrEqual(2); // flowchart + erd
      expect(html).not.toContain("<script");
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 30_000);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run test/plan-cli.test.ts`
Expected: FAIL — `bin/plan.ts` does not exist.

- [ ] **Step 4: Implement `bin/plan.ts`**

```ts
#!/usr/bin/env tsx
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import type { Block } from "../src/blocks.js";
import { assemble } from "../src/assemble.js";

async function main() {
  const { values } = parseArgs({
    options: {
      blocks: { type: "string" },
      title: { type: "string", default: "Plan" },
      source: { type: "string", default: "" },
      out: { type: "string", default: "plan.html" },
    },
  });
  if (!values.blocks) throw new Error("--blocks <path-to-blocks.json> is required");

  const blocks = JSON.parse(await readFile(values.blocks, "utf8")) as Block[];
  const html = await assemble(blocks, {
    title: values.title!,
    source: values.source || values.blocks,
    outDir: dirname(values.out!),
    onWarn: (m) => console.warn(m),
  });
  await mkdir(dirname(values.out!), { recursive: true });
  await writeFile(values.out!, html);
  console.log(`wrote ${values.out}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run test/plan-cli.test.ts`
Expected: PASS.

- [ ] **Step 6: Manual smoke check (open the file)**

Run:
```bash
npx tsx bin/plan.ts --blocks test/fixtures/sample-plan.blocks.json --title "Sample Plan" --out /tmp/plan.html && open /tmp/plan.html
```
Expected: a hand-drawn-styled page with a flowchart and an ERD on a paper background.

- [ ] **Step 7: Commit**

```bash
git add bin/plan.ts test/fixtures/sample-plan.blocks.json test/plan-cli.test.ts
git commit -m "feat: plan CLI — block array to self-contained plan.html (M0 complete)"
```

---

## Task 10: Git scope resolution

**Files:**
- Create: `src/git.ts`, `test/git.test.ts`

This is the only module that shells out to git. It resolves a target into two refs plus the unified diff, and reads file contents at a ref.

- [ ] **Step 1: Write the failing test (runs against this repo's own history)**

`test/git.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveScope, fileAtRef } from "../src/git.js";

describe("git scope", () => {
  it("resolves a commit target to base/head refs and a diff", async () => {
    // HEAD vs its parent always exists once this repo has >1 commit.
    const scope = await resolveScope({ kind: "commit", ref: "HEAD" }, { repoRoot: "." });
    expect(scope.headRef).toBe("HEAD");
    expect(scope.baseRef).toBe("HEAD^");
    expect(typeof scope.unifiedDiff).toBe("string");
  });

  it("reads file contents at a ref", async () => {
    const content = await fileAtRef("package.json", "HEAD", ".");
    expect(content).toContain('"name": "visual-skills"');
  });

  it("returns empty string for a path missing at a ref", async () => {
    const content = await fileAtRef("does/not/exist.ts", "HEAD", ".");
    expect(content).toBe("");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/git.test.ts`
Expected: FAIL — cannot resolve `../src/git.js`.

- [ ] **Step 3: Implement `src/git.ts`**

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export type Target =
  | { kind: "branch"; ref: string; base?: string }
  | { kind: "commit"; ref: string }
  | { kind: "pr"; number: number }
  | { kind: "working" };

export interface Scope {
  repoRoot: string;
  baseRef: string;
  headRef: string;
  label: string;
  unifiedDiff: string;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await exec("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

/** Best-effort default base: merge-base with the trunk (main, else master). */
async function defaultBase(headRef: string, cwd: string): Promise<string> {
  for (const trunk of ["main", "master"]) {
    try {
      const mb = (await git(["merge-base", trunk, headRef], cwd)).trim();
      if (mb) return mb;
    } catch { /* trunk missing — try next */ }
  }
  return `${headRef}^`;
}

export async function resolveScope(target: Target, opts: { repoRoot: string }): Promise<Scope> {
  const cwd = opts.repoRoot;
  let baseRef: string, headRef: string, label: string;

  switch (target.kind) {
    case "commit":
      headRef = target.ref; baseRef = `${target.ref}^`; label = `commit ${target.ref}`;
      break;
    case "branch":
      headRef = target.ref;
      baseRef = target.base ?? (await defaultBase(target.ref, cwd));
      label = `branch ${target.ref}`;
      break;
    case "working":
      headRef = ""; baseRef = "HEAD"; label = "working tree";
      break;
    case "pr": {
      // gh fetches the PR head into FETCH_HEAD; degrade clearly if gh absent.
      try {
        await exec("gh", ["pr", "checkout", String(target.number)], { cwd });
      } catch {
        throw new Error(`PR scope needs the gh CLI: could not check out PR #${target.number}`);
      }
      headRef = "HEAD"; baseRef = await defaultBase("HEAD", cwd); label = `PR #${target.number}`;
      break;
    }
  }

  const diffArgs = target.kind === "working"
    ? ["diff", baseRef]
    : ["diff", `${baseRef}...${headRef}`];
  const unifiedDiff = await git(diffArgs, cwd);
  return { repoRoot: cwd, baseRef, headRef: headRef || "WORKTREE", label, unifiedDiff };
}

/** File contents at a ref, or "" if the path does not exist there. */
export async function fileAtRef(path: string, ref: string, cwd: string): Promise<string> {
  if (ref === "WORKTREE" || ref === "") {
    try { return await (await import("node:fs/promises")).readFile(`${cwd}/${path}`, "utf8"); }
    catch { return ""; }
  }
  try { return await git(["show", `${ref}:${path}`], cwd); }
  catch { return ""; }
}

/** `git diff --numstat` + `--name-status` merged into FileChange-friendly rows. */
export async function changedFiles(baseRef: string, headRef: string, cwd: string) {
  const range = headRef === "WORKTREE" ? [baseRef] : [`${baseRef}...${headRef}`];
  const numstat = await git(["diff", "--numstat", ...range], cwd);
  const nameStatus = await git(["diff", "--name-status", ...range], cwd);

  const status = new Map<string, "A" | "M" | "D" | "R">();
  for (const line of nameStatus.trim().split("\n").filter(Boolean)) {
    const [s, ...rest] = line.split("\t");
    const path = rest[rest.length - 1];
    status.set(path, (s[0] as "A" | "M" | "D" | "R") ?? "M");
  }

  return numstat.trim().split("\n").filter(Boolean).map((line) => {
    const [added, deleted, path] = line.split("\t");
    return {
      path,
      status: status.get(path) ?? "M",
      added: added === "-" ? 0 : Number(added),
      deleted: deleted === "-" ? 0 : Number(deleted),
    };
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/git.test.ts`
Expected: PASS. (Requires this repo to have ≥2 commits — true after Task 9.)

- [ ] **Step 5: Commit**

```bash
git add src/git.ts test/git.test.ts
git commit -m "feat: git scope resolution + changed-files plumbing"
```

---

## Task 11: Diff parser (unified diff → DiffBlock[] + FileTreeBlock)

**Files:**
- Create: `src/parse-diff.ts`, `test/parse-diff.test.ts`

- [ ] **Step 1: Write the failing test**

`test/parse-diff.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseUnifiedDiff } from "../src/parse-diff.js";

const SAMPLE = `diff --git a/src/server/routers/league.ts b/src/server/routers/league.ts
index 7e8df7b..9682de9 100644
--- a/src/server/routers/league.ts
+++ b/src/server/routers/league.ts
@@ -56,6 +56,12 @@ export const leagueRouter = router({
       leagueService.createCheckoutSession(ctx.userId, input.leagueId),
     ),
 
+  captureOrder: protectedProcedure
+    .input(z.object({ leagueId: z.string(), orderId: z.string() }))
+    .mutation(({ ctx, input }) =>
+      leagueService.captureOrder(ctx.userId, input.leagueId, input.orderId),
+    ),
+
   join: protectedProcedure
`;

describe("parseUnifiedDiff", () => {
  it("splits into per-file diff blocks with hunks", () => {
    const blocks = parseUnifiedDiff(SAMPLE);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].path).toBe("src/server/routers/league.ts");
    expect(blocks[0].hunks).toHaveLength(1);
    expect(blocks[0].hunks[0].header).toContain("@@ -56,6 +56,12 @@");
    expect(blocks[0].hunks[0].lines.some((l) => l.startsWith("+  captureOrder"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/parse-diff.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement `src/parse-diff.ts`**

```ts
import type { DiffBlock, DiffHunk } from "./blocks.js";

/** Parse a `git diff` into one DiffBlock per file. Pure string work. */
export function parseUnifiedDiff(diff: string): DiffBlock[] {
  const blocks: DiffBlock[] = [];
  const lines = diff.split("\n");
  let cur: DiffBlock | null = null;
  let hunk: DiffHunk | null = null;
  let fileIdx = 0;

  const pushHunk = () => { if (cur && hunk) cur.hunks.push(hunk); hunk = null; };
  const pushFile = () => { pushHunk(); if (cur) blocks.push(cur); cur = null; };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      pushFile();
      const m = line.match(/ b\/(.+)$/);
      const path = m ? m[1] : `file-${fileIdx}`;
      cur = { type: "diff", id: `diff-${fileIdx++}`, title: path.split("/").pop() ?? path, path, hunks: [] };
    } else if (line.startsWith("@@")) {
      pushHunk();
      hunk = { header: line, lines: [] };
    } else if (hunk && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" "))) {
      // skip the +++/--- file headers
      if (line.startsWith("+++") || line.startsWith("---")) continue;
      hunk.lines.push(line);
    }
  }
  pushFile();
  return blocks;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/parse-diff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parse-diff.ts test/parse-diff.test.ts
git commit -m "feat: unified-diff parser to per-file diff blocks"
```

---

## Task 12: Prisma schema parser + diff → SchemaBlock (D2 ERD)

**Files:**
- Create: `src/prisma-schema.ts`, `test/prisma-schema.test.ts`

- [ ] **Step 1: Write the failing test**

`test/prisma-schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parsePrismaModels, diffModels, schemaDiffToBlock } from "../src/prisma-schema.js";

const BEFORE = `model League {
  id              String        @id @default(uuid())
  paymentStatus   PaymentStatus @default(FREE) @map("payment_status")
  stripeSessionId String?       @map("stripe_session_id")
}`;

const AFTER = `model League {
  id              String        @id @default(uuid())
  paymentStatus    PaymentStatus @default(FREE) @map("payment_status")
  paymentSessionId String?       @map("payment_session_id")
}`;

describe("prisma schema diff", () => {
  it("parses models and their fields", () => {
    const models = parsePrismaModels(BEFORE);
    expect(models.get("League")?.fields.map((f) => f.name)).toEqual(
      ["id", "paymentStatus", "stripeSessionId"],
    );
  });

  it("detects added and removed fields", () => {
    const diff = diffModels(parsePrismaModels(BEFORE), parsePrismaModels(AFTER));
    const league = diff.find((d) => d.model === "League")!;
    expect(league.addedFields.map((f) => f.name)).toContain("paymentSessionId");
    expect(league.removedFields.map((f) => f.name)).toContain("stripeSessionId");
  });

  it("renders a D2 ERD schema block with change markers", () => {
    const diff = diffModels(parsePrismaModels(BEFORE), parsePrismaModels(AFTER));
    const block = schemaDiffToBlock(diff, "erd");
    expect(block.type).toBe("schema");
    expect(block.kind).toBe("erd");
    expect(block.d2).toContain("shape: sql_table");
    expect(block.d2).toContain("paymentSessionId");
    expect(block.d2).toContain("stripeSessionId");   // shown as removed
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/prisma-schema.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement `src/prisma-schema.ts`**

```ts
import type { SchemaBlock } from "./blocks.js";

export interface PrismaField { name: string; type: string; }
export interface PrismaModel { name: string; fields: PrismaField[]; }
export interface ModelDiff {
  model: string;
  addedFields: PrismaField[];
  removedFields: PrismaField[];
  keptFields: PrismaField[];
}

/** Parse `model X { ... }` blocks into models with (name, type) fields. */
export function parsePrismaModels(schema: string): Map<string, PrismaModel> {
  const models = new Map<string, PrismaModel>();
  const re = /model\s+(\w+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema))) {
    const name = m[1];
    const fields: PrismaField[] = [];
    for (const raw of m[2].split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const parts = line.split(/\s+/);
      if (parts.length >= 2) fields.push({ name: parts[0], type: parts[1] });
    }
    models.set(name, { name, fields });
  }
  return models;
}

export function diffModels(
  before: Map<string, PrismaModel>,
  after: Map<string, PrismaModel>,
): ModelDiff[] {
  const names = new Set([...before.keys(), ...after.keys()]);
  const diffs: ModelDiff[] = [];
  for (const name of names) {
    const b = before.get(name)?.fields ?? [];
    const a = after.get(name)?.fields ?? [];
    const bNames = new Set(b.map((f) => f.name));
    const aNames = new Set(a.map((f) => f.name));
    const addedFields = a.filter((f) => !bNames.has(f.name));
    const removedFields = b.filter((f) => !aNames.has(f.name));
    const keptFields = a.filter((f) => bNames.has(f.name));
    if (addedFields.length || removedFields.length || !before.has(name) || !after.has(name)) {
      diffs.push({ model: name, addedFields, removedFields, keptFields });
    }
  }
  return diffs;
}

/** Render changed models as a single D2 ERD with +/- change markers in labels. */
export function schemaDiffToBlock(diffs: ModelDiff[], id = "schema-diff"): SchemaBlock {
  const tables = diffs.map((d) => {
    const rows: string[] = [];
    for (const f of d.keptFields) rows.push(`  ${f.name}: ${f.type}`);
    for (const f of d.addedFields) rows.push(`  ${f.name}: "${f.type}  (+ added)"`);
    for (const f of d.removedFields) rows.push(`  "${f.name} (removed)": "${f.type}"`);
    return `${d.model}: {\n  shape: sql_table\n${rows.join("\n")}\n}`;
  });
  return {
    type: "schema", id, title: "Schema changes", kind: "erd",
    d2: tables.join("\n\n") || "empty: { shape: sql_table\n  note: no model changes\n}",
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/prisma-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/prisma-schema.ts test/prisma-schema.test.ts
git commit -m "feat: prisma schema parser + diff to D2 ERD schema block"
```

---

## Task 13: tRPC router parser (TS compiler API)

**Files:**
- Create: `src/trpc-parse.ts`, `test/trpc-parse.test.ts`

Parse a router source file into procedures structurally (not by raw lines), using `typescript`'s AST. `typescript` is already a devDependency from Task 1.

- [ ] **Step 1: Write the failing test**

`test/trpc-parse.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseRouter } from "../src/trpc-parse.js";

const SRC = `
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "@/server/trpc";
export const leagueRouter = router({
  preview: publicProcedure
    .input(z.object({ inviteCode: z.string().min(1) }))
    .query(({ input }) => svc.preview(input.inviteCode)),
  captureOrder: protectedProcedure
    .input(z.object({ leagueId: z.string(), orderId: z.string() }))
    .mutation(({ ctx, input }) => svc.capture(input)),
});
`;

describe("parseRouter", () => {
  it("extracts procedures with auth, kind, and input source", () => {
    const procs = parseRouter(SRC, "league");
    const byName = Object.fromEntries(procs.map((p) => [p.name, p]));
    expect(byName["league.preview"].auth).toBe("public");
    expect(byName["league.preview"].kind).toBe("query");
    expect(byName["league.captureOrder"].auth).toBe("protected");
    expect(byName["league.captureOrder"].kind).toBe("mutation");
    expect(byName["league.captureOrder"].input).toContain("orderId");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/trpc-parse.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement `src/trpc-parse.ts`**

```ts
import ts from "typescript";
import type { ApiProcedure } from "./blocks.js";

/**
 * Parse a tRPC router source into procedures. Looks for `router({ ... })` and
 * treats each property as a procedure, walking its call chain to find the
 * procedure builder (public/protected), the .input(...) arg, and query/mutation.
 */
export function parseRouter(source: string, routerName: string): ApiProcedure[] {
  const sf = ts.createSourceFile("router.ts", source, ts.ScriptTarget.Latest, true);
  const procs: ApiProcedure[] = [];

  function findRouterObject(node: ts.Node): ts.ObjectLiteralExpression | undefined {
    let found: ts.ObjectLiteralExpression | undefined;
    const visit = (n: ts.Node) => {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) && n.expression.text === "router" &&
        n.arguments.length === 1 && ts.isObjectLiteralExpression(n.arguments[0])
      ) {
        found ??= n.arguments[0] as ts.ObjectLiteralExpression;
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
    return found;
  }

  const obj = findRouterObject(sf);
  if (!obj) return procs;

  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
    const procName = prop.name.text;
    let auth: ApiProcedure["auth"] = "unknown";
    let kind: ApiProcedure["kind"] = "unknown";
    let input = "";

    const walk = (expr: ts.Node) => {
      if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) {
        const method = expr.expression.name.text;
        if (method === "query" || method === "mutation" || method === "subscription") {
          kind = method as ApiProcedure["kind"];
        } else if (method === "input" && expr.arguments[0]) {
          input = expr.arguments[0].getText(sf);
        }
        walk(expr.expression.expression);
      } else if (ts.isPropertyAccessExpression(expr)) {
        walk(expr.expression);
      } else if (ts.isIdentifier(expr)) {
        if (expr.text === "publicProcedure") auth = "public";
        else if (expr.text === "protectedProcedure") auth = "protected";
      }
    };
    walk(prop.initializer);

    procs.push({ name: `${routerName}.${procName}`, auth, kind, input });
  }
  return procs;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/trpc-parse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trpc-parse.ts test/trpc-parse.test.ts
git commit -m "feat: structural tRPC router parser via TS compiler API"
```

---

## Task 14: API diff → ApiBlock

**Files:**
- Create: `src/api-diff.ts`, `test/api-diff.test.ts`

- [ ] **Step 1: Write the failing test**

`test/api-diff.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { diffProcedures } from "../src/api-diff.js";
import type { ApiProcedure } from "../src/blocks.js";

const before: ApiProcedure[] = [
  { name: "league.preview", auth: "public", kind: "query", input: "{ inviteCode }" },
  { name: "league.createCheckoutSession", auth: "protected", kind: "mutation", input: "{ leagueId }" },
];
const after: ApiProcedure[] = [
  { name: "league.preview", auth: "public", kind: "query", input: "{ inviteCode }" },
  { name: "league.createCheckoutSession", auth: "protected", kind: "mutation", input: "{ leagueId }" },
  { name: "league.captureOrder", auth: "protected", kind: "mutation", input: "{ leagueId, orderId }" },
];

describe("diffProcedures", () => {
  it("marks added/removed/changed and omits unchanged", () => {
    const block = diffProcedures(before, after, "tRPC changes");
    const byName = Object.fromEntries(block.procedures.map((p) => [p.name, p.change]));
    expect(byName["league.captureOrder"]).toBe("added");
    expect(byName["league.preview"]).toBeUndefined();   // unchanged, dropped
    expect(block.procedures.every((p) => p.change)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/api-diff.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement `src/api-diff.ts`**

```ts
import type { ApiBlock, ApiProcedure } from "./blocks.js";

function sig(p: ApiProcedure): string {
  return `${p.auth}|${p.kind}|${p.input}`;
}

/** Diff two procedure lists into an ApiBlock containing only changed procedures. */
export function diffProcedures(
  before: ApiProcedure[],
  after: ApiProcedure[],
  title = "API changes",
  id = "api-diff",
): ApiBlock {
  const beforeByName = new Map(before.map((p) => [p.name, p]));
  const afterByName = new Map(after.map((p) => [p.name, p]));
  const procedures: ApiProcedure[] = [];

  for (const p of after) {
    const prev = beforeByName.get(p.name);
    if (!prev) procedures.push({ ...p, change: "added" });
    else if (sig(prev) !== sig(p)) procedures.push({ ...p, change: "changed" });
  }
  for (const p of before) {
    if (!afterByName.has(p.name)) procedures.push({ ...p, change: "removed" });
  }
  return { type: "api", id, title, procedures };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/api-diff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api-diff.ts test/api-diff.test.ts
git commit -m "feat: tRPC procedure diff to API block"
```

---

## Task 15: Stack adapters

**Files:**
- Create: `src/adapters/stack-adapter.ts`, `src/adapters/generic.ts`, `src/adapters/prisma-trpc.ts`, `test/adapters.test.ts`

- [ ] **Step 1: Write the failing test**

`test/adapters.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { PrismaTrpcAdapter } from "../src/adapters/prisma-trpc.js";
import { GenericAdapter } from "../src/adapters/generic.js";
import { selectAdapter } from "../src/adapters/stack-adapter.js";

describe("stack adapters", () => {
  it("PrismaTrpcAdapter detects this repo as NOT prisma+trpc", async () => {
    // visual-skills itself has no prisma/schema.prisma
    expect(await new PrismaTrpcAdapter().detect(".")).toBe(false);
  });

  it("selectAdapter falls back to GenericAdapter when none match", async () => {
    const adapter = await selectAdapter(".", [new PrismaTrpcAdapter()]);
    expect(adapter).toBeInstanceOf(GenericAdapter);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/adapters.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement `src/adapters/stack-adapter.ts`**

```ts
import type { ApiBlock, SchemaBlock } from "../blocks.js";
import type { Scope } from "../git.js";
import { GenericAdapter } from "./generic.js";

export interface StackAdapter {
  name: string;
  detect(repoRoot: string): Promise<boolean>;
  schemaDiff(scope: Scope): Promise<SchemaBlock | null>;
  apiDiff(scope: Scope): Promise<ApiBlock[]>;
}

/** First adapter whose detect() passes, else GenericAdapter. */
export async function selectAdapter(
  repoRoot: string,
  adapters: StackAdapter[],
): Promise<StackAdapter> {
  for (const a of adapters) {
    if (await a.detect(repoRoot)) return a;
  }
  return new GenericAdapter();
}
```

- [ ] **Step 4: Implement `src/adapters/generic.ts`**

```ts
import type { StackAdapter } from "./stack-adapter.js";
import type { Scope } from "../git.js";

/** Fallback: no schema/api intelligence — file-tree + raw diff only. */
export class GenericAdapter implements StackAdapter {
  name = "generic";
  async detect(): Promise<boolean> { return true; }
  async schemaDiff(_scope: Scope) { return null; }
  async apiDiff(_scope: Scope) { return []; }
}
```

- [ ] **Step 5: Implement `src/adapters/prisma-trpc.ts`**

```ts
import { access } from "node:fs/promises";
import { join } from "node:path";
import type { StackAdapter } from "./stack-adapter.js";
import type { Scope } from "../git.js";
import type { ApiBlock, SchemaBlock } from "../blocks.js";
import { fileAtRef, changedFiles } from "../git.js";
import { parsePrismaModels, diffModels, schemaDiffToBlock } from "../prisma-schema.js";
import { parseRouter } from "../trpc-parse.js";
import { diffProcedures } from "../api-diff.js";

const SCHEMA_PATH = "prisma/schema.prisma";

export class PrismaTrpcAdapter implements StackAdapter {
  name = "prisma-trpc";

  async detect(repoRoot: string): Promise<boolean> {
    try {
      await access(join(repoRoot, SCHEMA_PATH));
      return true;
    } catch { return false; }
  }

  async schemaDiff(scope: Scope): Promise<SchemaBlock | null> {
    const before = await fileAtRef(SCHEMA_PATH, scope.baseRef, scope.repoRoot);
    const after = await fileAtRef(SCHEMA_PATH, scope.headRef, scope.repoRoot);
    if (!before && !after) return null;
    const diffs = diffModels(parsePrismaModels(before), parsePrismaModels(after));
    if (!diffs.length) return null;
    return schemaDiffToBlock(diffs);
  }

  async apiDiff(scope: Scope): Promise<ApiBlock[]> {
    const files = await changedFiles(scope.baseRef, scope.headRef, scope.repoRoot);
    const routers = files
      .map((f) => f.path)
      .filter((p) => /src\/server\/routers\/[^/]+\.ts$/.test(p) && !p.endsWith("_app.ts"));

    const blocks: ApiBlock[] = [];
    for (const path of routers) {
      const routerName = path.split("/").pop()!.replace(/\.ts$/, "");
      const beforeSrc = await fileAtRef(path, scope.baseRef, scope.repoRoot);
      const afterSrc = await fileAtRef(path, scope.headRef, scope.repoRoot);
      const before = beforeSrc ? parseRouter(beforeSrc, routerName) : [];
      const after = afterSrc ? parseRouter(afterSrc, routerName) : [];
      const block = diffProcedures(before, after, `tRPC: ${routerName}`, `api-${routerName}`);
      if (block.procedures.length) blocks.push(block);
    }
    return blocks;
  }
}
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npx vitest run test/adapters.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/adapters test/adapters.test.ts
git commit -m "feat: pluggable stack adapters (prisma-trpc + generic fallback)"
```

---

## Task 16: Recap gatherer + `bin/recap.ts` + end-to-end against ppgl #183

**Files:**
- Create: `src/gather-recap.ts`, `bin/recap.ts`, `test/gather-recap.test.ts`

- [ ] **Step 1: Write the failing test (composes blocks from a parsed diff + adapter)**

`test/gather-recap.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildBlocks } from "../src/gather-recap.js";
import { GenericAdapter } from "../src/adapters/generic.js";
import type { Scope } from "../src/git.js";

const scope: Scope = {
  repoRoot: ".", baseRef: "HEAD^", headRef: "HEAD", label: "commit HEAD",
  unifiedDiff: `diff --git a/foo.ts b/foo.ts
--- a/foo.ts
+++ b/foo.ts
@@ -1,1 +1,1 @@
-old
+new
`,
};

describe("buildBlocks", () => {
  it("produces a file-tree, prose summary, and diff blocks (generic stack)", async () => {
    const files = [{ path: "foo.ts", status: "M" as const, added: 1, deleted: 1 }];
    const blocks = await buildBlocks(scope, files, new GenericAdapter());
    const types = blocks.map((b) => b.type);
    expect(types).toContain("file-tree");
    expect(types).toContain("diff");
    // generic adapter contributes no schema/api blocks
    expect(types).not.toContain("schema");
    expect(types).not.toContain("api");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/gather-recap.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement `src/gather-recap.ts`**

```ts
import type { Block, FileChange, FileTreeBlock } from "./blocks.js";
import type { Scope, Target } from "./git.js";
import { resolveScope, changedFiles } from "./git.js";
import { parseUnifiedDiff } from "./parse-diff.js";
import { selectAdapter, type StackAdapter } from "./adapters/stack-adapter.js";
import { PrismaTrpcAdapter } from "./adapters/prisma-trpc.js";

/** Compose the ordered block array for a recap. Pure given its inputs. */
export async function buildBlocks(
  scope: Scope,
  files: FileChange[],
  adapter: StackAdapter,
): Promise<Block[]> {
  const blocks: Block[] = [];

  const fileTree: FileTreeBlock = { type: "file-tree", id: "files", title: "Files changed", files };
  blocks.push(fileTree);

  const totalAdd = files.reduce((n, f) => n + f.added, 0);
  const totalDel = files.reduce((n, f) => n + f.deleted, 0);
  blocks.push({
    type: "prose", id: "summary",
    markdown: `**${scope.label}** — ${files.length} files, +${totalAdd}/-${totalDel} (stack: ${adapter.name}).`,
  });

  const schema = await adapter.schemaDiff(scope);
  if (schema) blocks.push(schema);

  for (const api of await adapter.apiDiff(scope)) blocks.push(api);

  for (const diff of parseUnifiedDiff(scope.unifiedDiff)) blocks.push(diff);

  return blocks;
}

/** Top-level: resolve a target into a full recap block array. */
export async function gatherRecap(target: Target, repoRoot: string): Promise<{ scope: Scope; blocks: Block[]; adapter: string }> {
  const scope = await resolveScope(target, { repoRoot });
  const files = await changedFiles(scope.baseRef, scope.headRef, repoRoot);
  const adapter = await selectAdapter(repoRoot, [new PrismaTrpcAdapter()]);
  const blocks = await buildBlocks(scope, files, adapter);
  return { scope, blocks, adapter: adapter.name };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/gather-recap.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `bin/recap.ts`**

```ts
#!/usr/bin/env tsx
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import type { Target } from "../src/git.js";
import { gatherRecap } from "../src/gather-recap.js";
import { assemble } from "../src/assemble.js";

function parseTarget(values: Record<string, string | undefined>): Target {
  if (values.pr) return { kind: "pr", number: Number(values.pr) };
  if (values.commit) return { kind: "commit", ref: values.commit };
  if (values.branch) return { kind: "branch", ref: values.branch, base: values.base };
  return { kind: "working" };
}

async function main() {
  const { values } = parseArgs({
    options: {
      repo: { type: "string", default: "." },
      pr: { type: "string" },
      commit: { type: "string" },
      branch: { type: "string" },
      base: { type: "string" },
      out: { type: "string", default: ".recaps/recap.html" },
    },
  });

  const repoRoot = values.repo!;
  const { scope, blocks, adapter } = await gatherRecap(parseTarget(values), repoRoot);
  const html = await assemble(blocks, {
    title: `Recap — ${scope.label}`,
    source: `${repoRoot} · base ${scope.baseRef.slice(0, 10)} → head ${scope.headRef.slice(0, 10)} · stack ${adapter}`,
    status: { level: "green", text: `${blocks.length} blocks` },
    outDir: dirname(values.out!),
    onWarn: (m) => console.warn(m),
  });
  await mkdir(dirname(values.out!), { recursive: true });
  await writeFile(values.out!, html);
  console.log(`wrote ${values.out} (adapter: ${adapter})`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 6: End-to-end acceptance against ppgl PR #183**

Run:
```bash
npx tsx bin/recap.ts --repo ~/Projects/ppgl --commit 3559f61 --out /tmp/recap-183.html && open /tmp/recap-183.html
```
Expected: `/tmp/recap-183.html` opens offline and contains:
- a **Files changed** tree (≈23 files, incl. `src/lib/paypal.ts` added, `src/lib/stripe.ts` deleted),
- a **Schema changes** ERD showing `League` with `paymentSessionId` added and `stripeSessionId` removed,
- a **tRPC: league** API table with `league.captureOrder` marked `added`,
- per-file **diff** blocks.

Verify visually, then confirm no broken/empty blocks and no `<script>` tag:
```bash
grep -c "<script" /tmp/recap-183.html   # expected: 0
```

- [ ] **Step 7: Commit**

```bash
git add src/gather-recap.ts bin/recap.ts test/gather-recap.test.ts
git commit -m "feat: recap gatherer + recap CLI (M1 complete); verified on ppgl #183"
```

---

## Task 17: Full test sweep + README

**Files:**
- Create: `README.md`
- Modify: none

- [ ] **Step 1: Run the whole suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all tests PASS; `tsc --noEmit` reports no errors.

- [ ] **Step 2: Write `README.md`**

```markdown
# visual-skills

Self-hosted renderer that turns specs and code changes into a single
self-contained, hand-drawn-styled HTML document grounded in the real repo.

## Prerequisites
- Node 20+
- `d2` on PATH — `brew install d2` (the required rendering floor)
- `gh` CLI (optional, only for `--pr`)

## Usage

Plan (hand-authored blocks):
```bash
npx tsx bin/plan.ts --blocks blocks.json --title "My Plan" --out plans/x/plan.html
```

Recap (from a git target):
```bash
npx tsx bin/recap.ts --repo /path/to/repo --commit <sha>  --out .recaps/x/recap.html
npx tsx bin/recap.ts --repo /path/to/repo --branch <name> --out .recaps/x/recap.html
npx tsx bin/recap.ts --repo /path/to/repo --pr <number>   --out .recaps/x/recap.html
```

## Scope
This is the M0+M1 slice: D2 floor + assembler + recap gatherer (Prisma+tRPC
adapter). Excalidraw upgrade (M3), Shiki highlighting (M2), and the Claude Code
SKILL.md wiring (M4) are not yet implemented. See `docs/superpowers/specs/`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README with prerequisites and usage"
```

---

## Self-Review Notes

- **Spec coverage:** block model (§4.1 → Task 2); StackAdapter (§4.2 → Task 15); D2 renderer (§4.3 → Task 3); file-tree/diff/api/prose renderers (§4.4 → Tasks 4–7); assembler + template (§4.5 → Task 8); recap gatherer with scope/file-map/schema-diff/api-diff/annotated-diff (§4.6 → Tasks 10–16); both CLIs (Tasks 9, 16); testing incl. ppgl #183 e2e (§7 → Task 16 Step 6). `annotated-code`/`questions` types defined, renderers correctly deferred to M2 (assembler throws — matches §2 scope cut).
- **Type consistency:** `Block` union, `ApiProcedure`, `FileChange`, `Scope`, `Target`, `DiagramResult` are defined once and reused with identical names/signatures across tasks. `renderAll`/`renderDiagram` signatures in Task 3 match their use in Task 8. `changedFiles`/`fileAtRef`/`resolveScope` in Task 10 match use in Tasks 15–16.
- **Deferred-by-design:** Excalidraw path is present but dormant (no playwright dep) — fallback verified by Task 3's `excalidraw:false` path; full upgrade is M3.
- **Prereq:** `d2` must be installed (Task 1 Step 4) or Tasks 3, 8, 9, 16 will fail at render time.
