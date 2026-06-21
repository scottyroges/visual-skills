# Visual Skills M6 — Contextual Recaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recaps explain a change — a richer summary + a mechanical "where it fits" dependency graph in the CLI, plus an agent-selected behavioral diagram via the skill.

**Architecture:** A mechanical layer in `gather-recap` (summary + dependency-neighborhood diagram, both deterministic) and an intelligence layer in the `visual-recap` skill (selection guide + authoring recipes), connected by a new `recap --emit-blocks` JSON mode the skill augments and renders through `plan --blocks`. No renderer or `Block`/`DiagramKind` changes — the d2 floor already compiles sequence/state diagrams.

**Tech Stack:** TypeScript ESM (`tsx`), vitest, the `d2` binary, the TypeScript compiler API (already used in `trpc-parse.ts`).

**Commit convention:** Every commit message MUST end with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

**Spec:** `docs/superpowers/specs/2026-06-17-visual-skills-m6-design.md`

---

## File Structure

- **Create** `src/imports.ts` — `importsOf(source)`: extract import module specifiers from TS/JS source.
- **Create** `src/dep-graph.ts` — `dependencyNeighborhood(changedPaths, repoRoot, opts?)`: bounded 1-hop import graph → `DiagramBlock | null`.
- **Create** `src/recap-summary.ts` — `summaryMarkdown(scope, files, procedures, schemaChanged)`: synthesized summary Markdown.
- **Modify** `src/gather-recap.ts` — use the rich summary; add the where-it-fits diagram.
- **Modify** `bin/recap.ts` — add `--emit-blocks <path>`.
- **Modify** `skills/visual-recap/SKILL.md` — add the enrichment workflow, selection guide, recipes.
- **Modify** `test/skill-docs.test.ts` — extend the guard to require the selection guide.
- **Create** tests: `test/imports.test.ts`, `test/dep-graph.test.ts`, `test/recap-summary.test.ts`, `test/recap-emit-blocks.test.ts`; **modify** `test/gather-recap.test.ts`.

---

## Task 1: importsOf — extract import specifiers

**Files:**
- Create: `src/imports.ts`
- Test: `test/imports.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/imports.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { importsOf } from "../src/imports.js";

describe("importsOf", () => {
  it("collects static, re-export, and dynamic import specifiers (deduped)", () => {
    const src = [
      `import { a } from "./a.js";`,
      `import def from "pkg";`,
      `export * from "./b.js";`,
      `export { x } from "./a.js";`,
      `const y = await import("./c.js");`,
    ].join("\n");
    expect(importsOf(src).sort()).toEqual(["./a.js", "./b.js", "./c.js", "pkg"]);
  });

  it("returns an empty array for source with no imports", () => {
    expect(importsOf("const x = 1;\nexport const y = x + 1;")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- imports.test`
Expected: FAIL — `Cannot find module '../src/imports.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/imports.ts`:

```ts
import ts from "typescript";

/** Extract module specifiers from import/export-from/dynamic-import in TS/JS source. */
export function importsOf(source: string): string[] {
  const sf = ts.createSourceFile("f.ts", source, ts.ScriptTarget.Latest, true);
  const specs: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      specs.push(n.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(n) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier)
    ) {
      specs.push(n.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(n) &&
      n.expression.kind === ts.SyntaxKind.ImportKeyword &&
      n.arguments.length > 0 &&
      ts.isStringLiteral(n.arguments[0])
    ) {
      specs.push((n.arguments[0] as ts.StringLiteral).text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return [...new Set(specs)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- imports.test`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (expect clean), then:

```bash
git add src/imports.ts test/imports.test.ts
git commit -m "$(cat <<'EOF'
feat: importsOf — extract import specifiers via the TS compiler API

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: dependencyNeighborhood — the "where it fits" diagram

**Files:**
- Create: `src/dep-graph.ts`
- Test: `test/dep-graph.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/dep-graph.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dependencyNeighborhood } from "../src/dep-graph.js";
import { renderDiagram } from "../src/render-diagram.js";

async function tempRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vs-dep-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, content);
  }
  return root;
}

describe("dependencyNeighborhood", () => {
  it("returns null when no changed file is a source file", async () => {
    const root = await tempRepo({ "README.md": "# x" });
    try {
      expect(await dependencyNeighborhood(["README.md"], root)).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("graphs imports (outgoing) and importers (incoming) of a changed file and compiles via d2", async () => {
    const root = await tempRepo({
      "src/a.ts": `import { u } from "./util.js";\nimport { z } from "zod";\nexport const a = 1;`,
      "src/util.ts": `export const u = 1;`,
      "src/b.ts": `import { a } from "./a.js";\nexport const b = a;`,
    });
    try {
      const block = await dependencyNeighborhood(["src/a.ts"], root);
      expect(block).not.toBeNull();
      expect(block!.kind).toBe("architecture");
      // changed file highlighted; outgoing import + package + incoming importer present
      expect(block!.d2).toContain("src/a.ts");
      expect(block!.d2).toContain("style.fill"); // changed node highlighted
      expect(block!.d2).toContain("src/util");   // outgoing internal import
      expect(block!.d2).toContain("zod");         // outgoing package
      expect(block!.d2).toContain("src/b.ts");   // incoming importer
      const out = await renderDiagram(block!, { excalidraw: false });
      expect(out.svg).toMatch(/<svg/);
      expect(out.svg).not.toContain("failed to render");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("bounds node count and collapses overflow into a '+N more' node", async () => {
    const files: Record<string, string> = {
      "src/hub.ts": `export const hub = 1;`,
    };
    for (let i = 0; i < 30; i++) {
      files[`src/imp${i}.ts`] = `import { hub } from "./hub.js";\nexport const v${i} = hub;`;
    }
    const root = await tempRepo(files);
    try {
      const block = await dependencyNeighborhood(["src/hub.ts"], root, { maxNodes: 8 });
      expect(block).not.toBeNull();
      expect(block!.d2).toContain("more");
      // node lines = quoted ids at start of a line; keep it bounded (cap + the 'more' node + edges)
      const nodeDecls = (block!.d2.match(/^"/gm) ?? []).length;
      expect(nodeDecls).toBeLessThanOrEqual(9);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- dep-graph`
Expected: FAIL — `Cannot find module '../src/dep-graph.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/dep-graph.ts`:

```ts
import { readFile, readdir } from "node:fs/promises";
import { join, dirname, relative, normalize } from "node:path";
import type { DiagramBlock } from "./blocks.js";
import { importsOf } from "./imports.js";

const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".turbo"]);

function q(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Strip a source extension and a trailing /index so two specifiers to the same module match. */
function moduleKey(repoRelPath: string): string {
  return repoRelPath.replace(/\\/g, "/").replace(SOURCE_RE, "").replace(/\/index$/, "");
}

/** Resolve a relative import specifier (from a repo-relative file) to a module key; null for bare packages. */
function resolveRel(fromRepoRel: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const joined = normalize(join(dirname(fromRepoRel), spec)).replace(/\\/g, "/");
  return moduleKey(joined);
}

/** Recursively list repo-relative source files, skipping vendor/build dirs. */
async function walkSource(root: string, dir = root, acc: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".") {
      if (SKIP_DIRS.has(e.name)) continue;
    }
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      await walkSource(root, abs, acc);
    } else if (SOURCE_RE.test(e.name)) {
      acc.push(relative(root, abs).replace(/\\/g, "/"));
    }
  }
  return acc;
}

interface Node { label: string; changed: boolean; }

export interface DepGraphOpts { maxNodes?: number; }

/**
 * Build a bounded 1-hop import-neighborhood diagram around the changed source files:
 * their imports (outgoing) and importers (incoming). Returns null when there are no
 * source files among the changes or no edges resolve. TS/JS only.
 */
export async function dependencyNeighborhood(
  changedPaths: string[],
  repoRoot: string,
  opts: DepGraphOpts = {},
): Promise<DiagramBlock | null> {
  const cap = opts.maxNodes ?? 15;
  const sources = changedPaths.filter((p) => SOURCE_RE.test(p));
  if (sources.length === 0) return null;

  const changedKeys = new Set(sources.map(moduleKey));
  const nodes = new Map<string, Node>(); // id -> node
  const edges = new Set<string>();        // "fromId toId"
  const addNode = (id: string, label: string, changed = false): void => {
    const cur = nodes.get(id);
    if (cur) { if (changed) cur.changed = true; }
    else nodes.set(id, { label, changed });
  };
  const keyId = (key: string) => `m:${key}`;
  const pkgId = (name: string) => `p:${name}`;

  for (const p of sources) addNode(keyId(moduleKey(p)), p, true);

  // Outgoing: imports of each changed file.
  for (const p of sources) {
    const src = await readFile(join(repoRoot, p), "utf8").catch(() => null);
    if (!src) continue;
    for (const spec of importsOf(src)) {
      const rel = resolveRel(p, spec);
      if (rel) { addNode(keyId(rel), rel); edges.add(`${keyId(moduleKey(p))} ${keyId(rel)}`); }
      else { addNode(pkgId(spec), spec); edges.add(`${keyId(moduleKey(p))} ${pkgId(spec)}`); }
    }
  }

  // Incoming: repo source files that import a changed file.
  for (const rel of await walkSource(repoRoot)) {
    if (changedKeys.has(moduleKey(rel))) continue;
    const src = await readFile(join(repoRoot, rel), "utf8").catch(() => null);
    if (!src) continue;
    for (const spec of importsOf(src)) {
      const target = resolveRel(rel, spec);
      if (target && changedKeys.has(target)) {
        addNode(keyId(moduleKey(rel)), rel);
        edges.add(`${keyId(moduleKey(rel))} ${keyId(target)}`);
      }
    }
  }

  if (edges.size === 0) return null;

  // Bound: keep changed nodes + highest-degree neighbors up to cap; collapse the rest.
  const degree = new Map<string, number>();
  for (const e of edges) {
    const [from, to] = e.split(" ");
    degree.set(from, (degree.get(from) ?? 0) + 1);
    degree.set(to, (degree.get(to) ?? 0) + 1);
  }
  const changedIds = [...nodes].filter(([, n]) => n.changed).map(([id]) => id);
  const neighborIds = [...nodes.keys()].filter((id) => !nodes.get(id)!.changed);
  neighborIds.sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0));
  const keep = new Set<string>([...changedIds, ...neighborIds.slice(0, Math.max(0, cap - changedIds.length))]);
  const dropped = neighborIds.length - (keep.size - changedIds.length);

  const lines: string[] = ["direction: right"];
  for (const [id, n] of nodes) {
    if (!keep.has(id)) continue;
    lines.push(n.changed ? `${q(n.label)}: { style.fill: "#e6ffec" }` : q(n.label));
  }
  if (dropped > 0) lines.push(`${q(`+${dropped} more`)}`);
  for (const e of edges) {
    const [from, to] = e.split(" ");
    if (!keep.has(from) || !keep.has(to)) continue;
    lines.push(`${q(nodes.get(from)!.label)} -> ${q(nodes.get(to)!.label)}`);
  }

  return {
    type: "diagram",
    id: "where-it-fits",
    title: "Where it fits",
    kind: "architecture",
    d2: lines.join("\n"),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- dep-graph`
Expected: PASS (3 tests), including the live d2 compile.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (expect clean), then:

```bash
git add src/dep-graph.ts test/dep-graph.test.ts
git commit -m "$(cat <<'EOF'
feat: dependency-neighborhood "where it fits" diagram (bounded, d2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: recap-summary — synthesized summary Markdown

**Files:**
- Create: `src/recap-summary.ts`
- Test: `test/recap-summary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/recap-summary.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summaryMarkdown } from "../src/recap-summary.js";
import type { Scope } from "../src/git.js";
import type { ApiProcedure, FileChange } from "../src/blocks.js";

const scope = { repoRoot: ".", baseRef: "a", headRef: "b", label: "PR #183", unifiedDiff: "" } as Scope;
const files: FileChange[] = [
  { path: "src/server/routers/league.ts", status: "M", added: 20, deleted: 4 },
  { path: "prisma/schema.prisma", status: "M", added: 2, deleted: 2 },
];
const procs: ApiProcedure[] = [
  { name: "league.captureOrder", auth: "protected", kind: "mutation", input: "", change: "added" },
  { name: "league.createCheckout", auth: "protected", kind: "mutation", input: "", change: "removed" },
];

describe("summaryMarkdown", () => {
  it("synthesizes totals, areas, procedure changes, and a schema note", () => {
    const md = summaryMarkdown(scope, files, procs, true);
    expect(md).toContain("PR #183");
    expect(md).toContain("2 files");
    expect(md).toContain("+22/-6");
    expect(md).toContain("src/server/routers"); // an area touched
    expect(md).toContain("league.captureOrder"); // added proc
    expect(md).toContain("league.createCheckout"); // removed proc
    expect(md.toLowerCase()).toContain("schema"); // schema-changed note
  });

  it("handles a change with no procedures or schema (totals only)", () => {
    const md = summaryMarkdown(scope, [files[0]], [], false);
    expect(md).toContain("1 files");
    expect(md).not.toMatch(/added procedures|removed procedures/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- recap-summary`
Expected: FAIL — `Cannot find module '../src/recap-summary.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/recap-summary.ts`:

```ts
import type { Scope } from "./git.js";
import type { ApiProcedure, FileChange } from "./blocks.js";

/** Top-level directory area for a path, e.g. "src/server/routers/league.ts" -> "src/server/routers". */
function area(path: string): string {
  const parts = path.split("/");
  return parts.length <= 1 ? "(root)" : parts.slice(0, -1).join("/");
}

function uniqueSorted(items: string[]): string[] {
  return [...new Set(items)].sort();
}

function names(procs: ApiProcedure[], change: ApiProcedure["change"]): string[] {
  return procs.filter((p) => p.change === change).map((p) => p.name);
}

/** Synthesize a short Markdown summary from already-gathered recap data. Pure. */
export function summaryMarkdown(
  scope: Scope,
  files: FileChange[],
  procedures: ApiProcedure[],
  schemaChanged: boolean,
): string {
  const added = files.reduce((n, f) => n + f.added, 0);
  const deleted = files.reduce((n, f) => n + f.deleted, 0);
  const areas = uniqueSorted(files.map((f) => area(f.path)));

  const lines: string[] = [];
  lines.push(`**${scope.label}** — ${files.length} files, +${added}/-${deleted}.`);
  lines.push("");
  lines.push(`**Areas touched:** ${areas.map((a) => `\`${a}\``).join(", ")}`);

  const addedP = names(procedures, "added");
  const removedP = names(procedures, "removed");
  const changedP = names(procedures, "changed");
  if (addedP.length) lines.push(`**Added procedures:** ${addedP.map((n) => `\`${n}\``).join(", ")}`);
  if (removedP.length) lines.push(`**Removed procedures:** ${removedP.map((n) => `\`${n}\``).join(", ")}`);
  if (changedP.length) lines.push(`**Changed procedures:** ${changedP.map((n) => `\`${n}\``).join(", ")}`);
  if (schemaChanged) lines.push(`**Schema:** Prisma schema changed (see the schema diagram below).`);

  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- recap-summary`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (expect clean), then:

```bash
git add src/recap-summary.ts test/recap-summary.test.ts
git commit -m "$(cat <<'EOF'
feat: recap-summary — synthesized summary from files/procedures/schema

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire summary + where-it-fits into the recap

**Files:**
- Modify: `src/gather-recap.ts`
- Test: `test/gather-recap.test.ts` (update + add)

- [ ] **Step 1: Update the test**

In `test/gather-recap.test.ts`, the first test currently asserts a `prose` summary exists. Add assertions to it (and a new ordering test). Replace the FIRST `it(...)` block with:

```ts
  it("produces a rich summary, file-tree, and diff blocks (generic stack)", async () => {
    const files = [{ path: "foo.ts", status: "M" as const, added: 1, deleted: 1 }];
    const blocks = await buildBlocks(scope, files, new GenericAdapter());
    const types = blocks.map((b) => b.type);
    expect(types).toContain("file-tree");
    expect(types).toContain("diff");
    const summary = blocks.find((b) => b.type === "prose" && b.id === "summary");
    expect(summary).toBeDefined();
    expect((summary as { markdown: string }).markdown).toContain("Areas touched");
  });
```

(The `scope` and the degradation test already in the file are unchanged. Note: `foo.ts` does not exist on disk, so the dependency-neighborhood diagram returns null — that is expected here; the dep-graph is exercised directly in `test/dep-graph.test.ts` and end-to-end in Task 7.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- gather-recap`
Expected: FAIL — the current summary block is the one-liner without "Areas touched".

- [ ] **Step 3: Write the implementation**

In `src/gather-recap.ts`, add imports after the existing ones:

```ts
import { summaryMarkdown } from "./recap-summary.js";
import { dependencyNeighborhood } from "./dep-graph.js";
```

Replace the current body of `buildBlocks` (from the `const blocks: Block[] = [];` line through the `return blocks;`) with:

```ts
  const blocks: Block[] = [];
  blocks.push({ type: "file-tree", id: "files", title: "Files changed", files });

  let schemaBlock = null as Awaited<ReturnType<StackAdapter["schemaDiff"]>>;
  try {
    schemaBlock = await adapter.schemaDiff(scope, onWarn);
  } catch (err) {
    onWarn?.(`schema diff skipped: ${err instanceof Error ? err.message : String(err)}`);
  }

  let procedures: import("./blocks.js").ApiProcedure[] = [];
  let apiBlocks: import("./blocks.js").ApiBlock[] = [];
  try {
    apiBlocks = await adapter.apiDiff(scope, onWarn);
    procedures = apiBlocks.flatMap((b) => b.procedures);
  } catch (err) {
    onWarn?.(`api diff skipped: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Rich summary (mechanical), placed first.
  blocks.unshift({
    type: "prose",
    id: "summary",
    markdown: summaryMarkdown(scope, files, procedures, schemaBlock != null),
  });

  // "Where it fits" dependency-neighborhood diagram (mechanical, TS/JS only).
  try {
    const fits = await dependencyNeighborhood(files.map((f) => f.path), scope.repoRoot);
    if (fits) blocks.push(fits);
  } catch (err) {
    onWarn?.(`where-it-fits skipped: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (schemaBlock) blocks.push(schemaBlock);

  const diagram = apiSurfaceDiagram(procedures, "api-surface", "API surface");
  if (diagram) blocks.push(diagram);
  for (const api of apiBlocks) blocks.push(api);

  for (const diff of parseUnifiedDiff(scope.unifiedDiff)) blocks.push(diff);

  return blocks;
```

Note: keep the existing imports for `apiSurfaceDiagram`, `parseUnifiedDiff`, `StackAdapter`, etc. (already present). The `Block`, `FileChange`, `FileTreeBlock` type imports remain.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- gather-recap`
Expected: PASS (the rich-summary test, the ordering, and the existing degradation test).

- [ ] **Step 5: Full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/gather-recap.ts test/gather-recap.test.ts
git commit -m "$(cat <<'EOF'
feat: rich summary + where-it-fits diagram in recaps

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: recap `--emit-blocks` mode

**Files:**
- Modify: `bin/recap.ts`
- Test: `test/recap-emit-blocks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/recap-emit-blocks.test.ts`. It exercises the round-trip at the library level (emit the gathered blocks as JSON, then render them through `assemble`, the same path `plan --blocks` uses):

```ts
import { describe, it, expect } from "vitest";
import { buildBlocks } from "../src/gather-recap.js";
import { GenericAdapter } from "../src/adapters/generic.js";
import { assemble } from "../src/assemble.js";
import type { Block } from "../src/blocks.js";
import type { Scope } from "../src/git.js";

const scope: Scope = {
  repoRoot: ".", baseRef: "HEAD^", headRef: "HEAD", label: "commit HEAD",
  unifiedDiff: "diff --git a/foo.ts b/foo.ts\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new\n",
};

describe("recap blocks round-trip", () => {
  it("gathered blocks serialize to JSON and render through assemble", async () => {
    const files = [{ path: "foo.ts", status: "M" as const, added: 1, deleted: 1 }];
    const blocks = await buildBlocks(scope, files, new GenericAdapter());
    const json = JSON.stringify(blocks);
    const restored = JSON.parse(json) as Block[];
    expect(Array.isArray(restored)).toBe(true);
    const html = await assemble(restored, { title: "Recap", source: "x" });
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).not.toContain("<script");
    expect(html).toContain("Areas touched"); // the rich summary survived the round-trip
  });
});
```

- [ ] **Step 2: Run test to verify it fails / passes**

Run: `npm test -- recap-emit-blocks`
Expected: PASS already (this validates the data round-trips; it does not require the CLI flag). If it fails, the block array is not JSON-serializable — fix the producer, not the test.

- [ ] **Step 3: Add the `--emit-blocks` flag to the CLI**

In `bin/recap.ts`, add `emitBlocks` to the parseArgs options (after `out`):

```ts
      out: { type: "string", default: ".recaps/recap.html" },
      "emit-blocks": { type: "string" },
```

Then, after the `gatherRecap(...)` call and before building HTML, add the emit branch and make HTML conditional. Replace the block from `const html = await assemble(...)` through the final `console.log(...)` with:

```ts
  const emitPath = values["emit-blocks"];
  if (emitPath) {
    await mkdir(dirname(emitPath), { recursive: true });
    await writeFile(emitPath, JSON.stringify(blocks, null, 2));
    console.log(`wrote ${emitPath} (${blocks.length} blocks, adapter: ${adapter})`);
  }

  if (emitPath && values.out === ".recaps/recap.html") {
    // emit-only: the user asked for blocks and did not override --out; skip HTML.
    return;
  }

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
```

(So `--emit-blocks x.json` alone writes only JSON; `--emit-blocks x.json --out y.html` writes both; `--out` alone is unchanged.)

- [ ] **Step 4: Verify the CLI flag end-to-end**

Run:

```bash
cd ~/Projects/visual-skills
npx tsx bin/recap.ts --repo ~/Projects/ppgl --commit 3559f61 --emit-blocks /tmp/m6-blocks.json
node -e "const b=require('/tmp/m6-blocks.json'); if(!Array.isArray(b)||!b.length) throw new Error('not a block array'); console.log('blocks:', b.length, 'types:', [...new Set(b.map(x=>x.type))].join(','))"
npx tsx bin/plan.ts --blocks /tmp/m6-blocks.json --title "round-trip" --out /tmp/m6-rt.html && grep -c "failed to render" /tmp/m6-rt.html
```

Expected: a `wrote /tmp/m6-blocks.json (... blocks ...)` line; the node check prints the block count and types; `plan` writes the HTML; the final `grep -c` prints `0`.

- [ ] **Step 5: Full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add bin/recap.ts test/recap-emit-blocks.test.ts
git commit -m "$(cat <<'EOF'
feat: recap --emit-blocks writes the gathered Block[] as JSON

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: visual-recap skill — enrichment workflow + selection guide

**Files:**
- Modify: `skills/visual-recap/SKILL.md`
- Modify: `test/skill-docs.test.ts`

- [ ] **Step 1: Extend the guard test first**

In `test/skill-docs.test.ts`, add a test inside the existing `describe("skill docs stay in sync", ...)` block:

```ts
  it("visual-recap documents the behavioral diagram selection guide", () => {
    expect(recapSkill).toContain("sequence");
    expect(recapSkill).toContain("state");
    expect(recapSkill).toContain("--emit-blocks");
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- skill-docs`
Expected: FAIL — the current visual-recap SKILL.md has no enrichment/selection section.

- [ ] **Step 3: Append the enrichment section to the skill**

Append the following to the END of `skills/visual-recap/SKILL.md`:

````markdown

## Add context (smart enrichment)

The bare recap already includes a summary and a "where it fits" dependency graph. To add a
behavioral view tailored to the change, enrich it:

1. Emit the gathered blocks instead of HTML:

       cd "$VISUAL_SKILLS_DIR"
       npx tsx bin/recap.ts --repo <ABSOLUTE_TARGET_REPO> <target flag> --emit-blocks <ABSOLUTE_BLOCKS_JSON>

2. Read that block array (it has the summary, file-tree, where-it-fits graph, schema/API,
   diffs) **and** read the actual diff. Optionally rewrite the `summary` prose block's
   `markdown` to explain *why* the change was made, not just what.

3. **Author ONE behavioral diagram** for the change (see the selection guide), and insert it
   into the array right after the `where-it-fits` block. Diagrams are `diagram` blocks with a
   `d2` source (the floor).

4. Render the combined array:

       npx tsx bin/plan.ts --blocks <ABSOLUTE_BLOCKS_JSON> --title "Recap — <label>" --out <ABSOLUTE_OUT>
       open <ABSOLUTE_OUT>

### Which behavioral diagram to pick

- **Sequence diagram** (`"kind": "sequence"`) — when the change adds or alters a
  multi-collaborator runtime path: a new request/response flow, an external integration call
  chain. Collaborators on lifelines, time downward, ONE scenario.
- **State machine** (`"kind": "architecture"`) — when the change alters a bounded lifecycle:
  statuses, subscription / checkout / signup stages — anything where an entity is in one of N
  states with labeled transitions.
- If the change is purely structural (no clear runtime flow or lifecycle), the "where it
  fits" graph already covers it — skip the behavioral diagram rather than force one.

Broader diagram types (C4 context/container, DDD context maps, data-flow, event/pub-sub
topology, CI / blast-radius, BPMN, journey maps) are **not yet in scope** — do not attempt
them.

### Authoring recipes (valid d2)

Sequence:

    { "type": "diagram", "id": "how-it-works", "title": "captureOrder flow", "kind": "sequence",
      "d2": "shape: sequence_diagram\nclient -> api: captureOrder(id)\napi -> paypal: capture(id)\npaypal -> api: ok\napi -> client: order" }

State machine:

    { "type": "diagram", "id": "lifecycle", "title": "Payment states", "kind": "architecture",
      "d2": "direction: right\nPENDING -> PAID: capture\nPENDING -> FREE: cancel" }

Quote any d2 key/value containing a dot or space. An invalid diagram degrades to a visible
placeholder rather than breaking the document.
````

- [ ] **Step 4: Run the guard + full suite**

Run: `npm test -- skill-docs` (expect PASS), then `npm test && npm run typecheck` (expect all pass, no type errors).

- [ ] **Step 5: Commit**

```bash
git add skills/visual-recap/SKILL.md test/skill-docs.test.ts
git commit -m "$(cat <<'EOF'
feat: visual-recap enrichment workflow + behavioral diagram selection guide

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: every test passes; no type errors.

- [ ] **Step 2: ppgl recap regression (now with summary + where-it-fits)**

```bash
cd ~/Projects/visual-skills
npx tsx bin/recap.ts --repo ~/Projects/ppgl --commit 3559f61 --out /tmp/m6-recap.html 2>/tmp/m6-recap.err
echo "exit=$?"; echo "stderr:"; cat /tmp/m6-recap.err
echo "--- <script (expect 0) ---"; grep -c "<script" /tmp/m6-recap.html
echo "--- summary 'Areas touched' present (expect >=1) ---"; grep -c "Areas touched" /tmp/m6-recap.html
echo "--- 'Where it fits' present (expect >=1) ---"; grep -c "Where it fits" /tmp/m6-recap.html
echo "--- placeholder leaks (expect 0) ---"; grep -c "failed to render" /tmp/m6-recap.html
```

Expected: exit 0; stderr empty; `<script>` 0; "Areas touched" >= 1; "Where it fits" >= 1 (ppgl's change touches TS files, so the dep-graph resolves); "failed to render" 0.

- [ ] **Step 3: Enrichment round-trip (emit → render)**

```bash
cd ~/Projects/visual-skills
npx tsx bin/recap.ts --repo ~/Projects/ppgl --commit 3559f61 --emit-blocks /tmp/m6-blocks.json
npx tsx bin/plan.ts --blocks /tmp/m6-blocks.json --title "round-trip" --out /tmp/m6-rt.html
echo "--- round-trip placeholder leaks (expect 0) ---"; grep -c "failed to render" /tmp/m6-rt.html
echo "--- round-trip script (expect 0) ---"; grep -c "<script" /tmp/m6-rt.html
```

Expected: both commands exit 0; both `grep -c` print `0` (the emitted blocks render cleanly through the plan path).

- [ ] **Step 4: Manual enrichment check (on the user's machine)**

Run by the human partner: in a Claude Code session with the `visual-recap` skill installed, ask to "make a visual recap of commit <sha>". Confirm the agent emits blocks, authors a behavioral (sequence/state) diagram appropriate to the change, and renders a doc that includes the summary, where-it-fits graph, and the new diagram. Behavioral; verified live.

- [ ] **Step 5: Final commit (only if anything changed)**

If Steps 1–3 surfaced a fix, commit it with the co-author trailer. Otherwise the automated portion of M6 is complete; the manual enrichment check (Step 4) remains for the user.

---

## Notes for the Implementer

- **The dependency graph reads the working tree** under `repoRoot` (not a git ref) for importer scanning — correct for the common "recap my recent change" case and acceptable for historical commits (it is a navigational aid, per the spec).
- **Graceful degradation is a hard requirement:** the dep-graph returns `null` (no diagram) on any resolution failure or non-TS/JS change; the summary always renders; an agent-authored diagram degrades to a placeholder if its d2 is invalid.
- **Quote all d2 keys/values** in `dep-graph.ts` (paths contain dots and slashes) — the compile-through-`d2` test guards this.
- **Run single tests** during a task; run the full suite in Tasks 4, 5, 6, and 7.
