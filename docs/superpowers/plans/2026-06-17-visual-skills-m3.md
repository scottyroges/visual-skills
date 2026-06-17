# Visual Skills M3 — Editable Diagrams (Excalidraw Upgrade) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the dormant Excalidraw editable-diagram upgrade as an opt-in, and add two producers (recap API-surface diagram, plan mermaid-fence promotion) that emit both a D2 floor and a mermaid source.

**Architecture:** Two pure producers build an internal model and emit `d2` + `mermaid` from it (so floor and editable scene never diverge); a small mermaid→d2 converter backs plan-fence promotion. The Excalidraw browser path stays graceful-by-default — heavy deps live behind an opt-in `setup:excalidraw` script that esbuild-bundles the libraries into an offline `file://` bundle; absent that, rendering falls back to the D2 sketch (unchanged).

**Tech Stack:** TypeScript ESM (`tsx`), vitest, the `d2` binary; opt-in: playwright + Chromium, `@excalidraw/excalidraw`, `@excalidraw/mermaid-to-excalidraw`, react/react-dom, esbuild.

**Commit convention:** Every commit message MUST end with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

**Spec:** `docs/superpowers/specs/2026-06-17-visual-skills-m3-design.md`

---

## File Structure

- **Create** `src/mermaid-to-d2.ts` — `mermaidFlowchartToD2(mermaid): string | null` (common flowchart subset → d2; null otherwise).
- **Create** `src/promote-mermaid.ts` — `promoteMermaidFences(blocks): Block[]` (split prose ` ```mermaid ` fences into diagram blocks).
- **Create** `src/api-diagram.ts` — `apiSurfaceDiagram(procedures, id?, title?): DiagramBlock | null` (recap API-surface, d2+mermaid).
- **Modify** `src/gather-recap.ts` — emit the API-surface diagram before the API tables.
- **Modify** `bin/plan.ts` — run `promoteMermaidFences` before `assemble`.
- **Modify** `src/render-diagram.ts` — add an injectable `RenderDeps` seam so the Excalidraw path is unit-testable without a browser.
- **Create** `scripts/setup-excalidraw.mjs`, `scripts/excalidraw-entry.mjs`, `assets/excalidraw-bundle.html`; **modify** `package.json` (script), `.gitignore`, `README.md`.
- **Create** tests: `test/mermaid-to-d2.test.ts`, `test/promote-mermaid.test.ts`, `test/api-diagram.test.ts`, `test/render-excalidraw.test.ts`; **modify** `test/gather-recap.test.ts`.

---

## Task 1: mermaid→d2 converter

**Files:**
- Create: `src/mermaid-to-d2.ts`
- Test: `test/mermaid-to-d2.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/mermaid-to-d2.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mermaidFlowchartToD2 } from "../src/mermaid-to-d2.js";
import { renderDiagram } from "../src/render-diagram.js";

describe("mermaidFlowchartToD2", () => {
  it("converts a simple graph with labels, edge labels, and direction", () => {
    const d2 = mermaidFlowchartToD2("graph TD\n  A[Start] --> B{Choice}\n  B -->|yes| C(Done)");
    expect(d2).not.toBeNull();
    expect(d2).toContain("direction: down");
    expect(d2).toContain('"A": "Start"');
    expect(d2).toContain('"A" -> "B"');
    expect(d2).toContain('"B" -> "C": "yes"');
  });

  it("maps LR/RL/BT directions", () => {
    expect(mermaidFlowchartToD2("graph LR\nA-->B")).toContain("direction: right");
    expect(mermaidFlowchartToD2("flowchart RL\nA-->B")).toContain("direction: left");
    expect(mermaidFlowchartToD2("graph BT\nA-->B")).toContain("direction: up");
  });

  it("handles chained edges on one line", () => {
    const d2 = mermaidFlowchartToD2("graph LR\nA-->B-->C")!;
    expect(d2).toContain('"A" -> "B"');
    expect(d2).toContain('"B" -> "C"');
  });

  it("returns null for non-flowchart or unsupported syntax", () => {
    expect(mermaidFlowchartToD2("sequenceDiagram\nAlice->>John: Hi")).toBeNull();
    expect(mermaidFlowchartToD2("erDiagram\nA ||--o{ B : has")).toBeNull();
    expect(mermaidFlowchartToD2("not a diagram at all")).toBeNull();
    expect(mermaidFlowchartToD2("graph TD\nA & B --> C")).toBeNull();
  });

  it("emits d2 that compiles via the d2 binary", async () => {
    const d2 = mermaidFlowchartToD2("graph TD\n  A[Start] --> B{Choice}\n  B -->|yes| C(Done)")!;
    const out = await renderDiagram(
      { type: "diagram", id: "m", title: "m", kind: "flowchart", d2 },
      { excalidraw: false },
    );
    expect(out.svg).toMatch(/<svg/);
    expect(out.svg).not.toContain("failed to render");
  }, 30_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- mermaid-to-d2`
Expected: FAIL — `Cannot find module '../src/mermaid-to-d2.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/mermaid-to-d2.ts`:

```ts
const DIR: Record<string, string> = { TD: "down", TB: "down", BT: "up", LR: "right", RL: "left" };

function q(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// A node piece: an id with an optional bracketed label, e.g. A, A[Label], A(Label),
// A{Label}, A((Label)). Returns null if the piece is not a valid node.
const NODE = /^([A-Za-z0-9_]+)(?:(?:\[\[|\(\(|\{\{|\[|\(|\{)([^\]\)}]*)(?:\]\]|\)\)|\}\}|\]|\)|\}))?$/;

// A single edge label carried in pipes immediately after an arrow: |label| Node
function splitSeg(seg: string): { label?: string; node: string } {
  const m = seg.trim().match(/^\|([^|]*)\|\s*(.*)$/);
  return m ? { label: m[1], node: m[2].trim() } : { node: seg.trim() };
}

/**
 * Convert the common mermaid flowchart subset to D2. Returns null for anything
 * outside the subset (caller should then leave the fence as inline code).
 */
export function mermaidFlowchartToD2(mermaid: string): string | null {
  const lines = mermaid
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("%%"));
  if (lines.length === 0) return null;

  const header = lines[0].match(/^(?:graph|flowchart)\s+(TD|TB|BT|LR|RL)\b/i);
  if (!header) return null;
  const direction = DIR[header[1].toUpperCase()];

  const labels = new Map<string, string>();
  const order: string[] = [];
  const edges: { from: string; to: string; label?: string }[] = [];

  function takeNode(piece: string): string | null {
    const m = piece.trim().match(NODE);
    if (!m) return null;
    const id = m[1];
    if (m[2] !== undefined && m[2] !== "") labels.set(id, m[2]);
    if (!order.includes(id)) order.push(id);
    return id;
  }

  const ARROW = /\s*(?:-\.->|-->|---|==>)\s*/;

  for (const line of lines.slice(1)) {
    const segs = line.split(ARROW);
    if (segs.length < 2) {
      // standalone node declaration
      if (takeNode(line) === null) return null;
      continue;
    }
    let prevId = takeNode(splitSeg(segs[0]).node);
    if (prevId === null) return null;
    for (let i = 1; i < segs.length; i++) {
      const cur = splitSeg(segs[i]);
      const curId = takeNode(cur.node);
      if (curId === null) return null;
      edges.push({ from: prevId, to: curId, label: cur.label || undefined });
      prevId = curId;
    }
  }

  const out: string[] = [`direction: ${direction}`];
  for (const id of order) {
    const label = labels.get(id);
    out.push(label !== undefined ? `${q(id)}: ${q(label)}` : q(id));
  }
  for (const e of edges) {
    const base = `${q(e.from)} -> ${q(e.to)}`;
    out.push(e.label ? `${base}: ${q(e.label)}` : base);
  }
  return out.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- mermaid-to-d2`
Expected: PASS (5 tests). The compile test requires the `d2` binary on PATH (already a project prerequisite).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/mermaid-to-d2.ts test/mermaid-to-d2.test.ts
git commit -m "$(cat <<'EOF'
feat: mermaid-flowchart-to-d2 converter (common subset, null otherwise)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Promote mermaid fences in plans

**Files:**
- Create: `src/promote-mermaid.ts`
- Modify: `bin/plan.ts`
- Test: `test/promote-mermaid.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/promote-mermaid.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { promoteMermaidFences } from "../src/promote-mermaid.js";
import type { Block } from "../src/blocks.js";

describe("promoteMermaidFences", () => {
  it("splits a convertible mermaid fence into prose + flowchart diagram + prose, in order", () => {
    const blocks: Block[] = [
      {
        type: "prose", id: "p",
        markdown: "Before text.\n\n```mermaid\ngraph TD\nA-->B\n```\n\nAfter text.",
      },
    ];
    const out = promoteMermaidFences(blocks);
    expect(out.map((b) => b.type)).toEqual(["prose", "diagram", "prose"]);
    const diagram = out[1] as Extract<Block, { type: "diagram" }>;
    expect(diagram.kind).toBe("flowchart");
    expect(diagram.mermaid).toContain("graph TD");
    expect(diagram.d2).toContain('"A" -> "B"');
    expect(out[0]).toMatchObject({ type: "prose" });
    expect((out[0] as Extract<Block, { type: "prose" }>).markdown).toContain("Before text.");
    expect((out[2] as Extract<Block, { type: "prose" }>).markdown).toContain("After text.");
  });

  it("leaves an unconvertible fence inline (no diagram block)", () => {
    const blocks: Block[] = [
      { type: "prose", id: "p", markdown: "```mermaid\nsequenceDiagram\nA->>B: hi\n```" },
    ];
    const out = promoteMermaidFences(blocks);
    expect(out.every((b) => b.type !== "diagram")).toBe(true);
    expect((out[0] as Extract<Block, { type: "prose" }>).markdown).toContain("sequenceDiagram");
  });

  it("passes non-prose blocks through unchanged and keeps ids unique", () => {
    const blocks: Block[] = [
      { type: "questions", id: "q", title: "Q", questions: [{ question: "x", recommendedDefault: "y" }] },
      { type: "prose", id: "p", markdown: "```mermaid\ngraph LR\nA-->B\n```\n\ntail" },
    ];
    const out = promoteMermaidFences(blocks);
    expect(out[0]).toEqual(blocks[0]);
    const ids = out.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- promote-mermaid`
Expected: FAIL — `Cannot find module '../src/promote-mermaid.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/promote-mermaid.ts`:

```ts
import type { Block, ProseBlock, DiagramBlock } from "./blocks.js";
import { mermaidFlowchartToD2 } from "./mermaid-to-d2.js";

// Matches a standard fenced ```mermaid ... ``` block; captures the inner source.
const FENCE = /```mermaid[ \t]*\r?\n([\s\S]*?)\r?\n```/g;

function expandProse(block: ProseBlock): Block[] {
  const md = block.markdown;
  const result: Block[] = [];
  let lastIndex = 0;
  let textCount = 0;
  let diagramCount = 0;
  let m: RegExpExecArray | null;

  // Re-create the regex per call to reset lastIndex safely.
  const re = new RegExp(FENCE.source, "g");
  while ((m = re.exec(md)) !== null) {
    const mermaid = m[1];
    const d2 = mermaidFlowchartToD2(mermaid);
    if (d2 === null) continue; // leave this fence inline; do not split here

    const before = md.slice(lastIndex, m.index);
    if (before.trim()) {
      result.push({
        type: "prose",
        id: textCount === 0 ? block.id : `${block.id}-t${textCount}`,
        markdown: before.trim(),
        ...(block.title && textCount === 0 ? { title: block.title } : {}),
      });
      textCount++;
    }
    const diagram: DiagramBlock = {
      type: "diagram",
      id: `${block.id}-mermaid-${diagramCount++}`,
      title: "Diagram",
      kind: "flowchart",
      d2,
      mermaid,
    };
    result.push(diagram);
    lastIndex = m.index + m[0].length;
  }

  if (result.length === 0) return [block]; // nothing promoted

  const tail = md.slice(lastIndex);
  if (tail.trim()) {
    result.push({
      type: "prose",
      id: textCount === 0 ? block.id : `${block.id}-t${textCount}`,
      markdown: tail.trim(),
    });
  }
  return result;
}

/** Promote convertible ```mermaid fences in prose blocks into diagram blocks. */
export function promoteMermaidFences(blocks: Block[]): Block[] {
  return blocks.flatMap((b) => (b.type === "prose" ? expandProse(b) : [b]));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- promote-mermaid`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into the plan CLI**

In `bin/plan.ts`, add the import after the existing imports:

```ts
import { promoteMermaidFences } from "../src/promote-mermaid.js";
```

Then change the assemble call to promote first. Replace:

```ts
  const blocks = JSON.parse(await readFile(values.blocks, "utf8")) as Block[];
  const html = await assemble(blocks, {
```

with:

```ts
  const blocks = JSON.parse(await readFile(values.blocks, "utf8")) as Block[];
  const promoted = promoteMermaidFences(blocks);
  const html = await assemble(promoted, {
```

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/promote-mermaid.ts bin/plan.ts test/promote-mermaid.test.ts
git commit -m "$(cat <<'EOF'
feat: promote convertible mermaid fences in plans to diagram blocks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: API-surface diagram producer

**Files:**
- Create: `src/api-diagram.ts`
- Test: `test/api-diagram.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/api-diagram.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { apiSurfaceDiagram } from "../src/api-diagram.js";
import { renderDiagram } from "../src/render-diagram.js";
import type { ApiProcedure } from "../src/blocks.js";

const procs: ApiProcedure[] = [
  { name: "league.captureOrder", auth: "protected", kind: "mutation", input: "", change: "added" },
  { name: "league.createCheckout", auth: "protected", kind: "mutation", input: "", change: "removed" },
  { name: "user.me", auth: "public", kind: "query", input: "" },
];

describe("apiSurfaceDiagram", () => {
  it("returns null for no procedures", () => {
    expect(apiSurfaceDiagram([])).toBeNull();
  });

  it("groups by router and reflects changes in both d2 and mermaid", () => {
    const block = apiSurfaceDiagram(procs)!;
    expect(block.type).toBe("diagram");
    expect(block.kind).toBe("architecture");
    // d2 floor: quoted router container + change fill
    expect(block.d2).toContain('"league"');
    expect(block.d2).toContain('"captureOrder"');
    expect(block.d2).toContain("style.fill");
    expect(block.d2).toContain('client -> "league"');
    // mermaid upgrade: dot-free ids, labels keep names, change classes
    expect(block.mermaid).toContain("graph LR");
    expect(block.mermaid).toContain("subgraph league");
    expect(block.mermaid).toContain('league_captureOrder["captureOrder"]');
    expect(block.mermaid).toContain("class league_captureOrder added;");
    expect(block.mermaid).not.toMatch(/\bleague\.captureOrder\b/); // ids never contain dots
  });

  it("emits d2 that compiles via the d2 binary", async () => {
    const block = apiSurfaceDiagram(procs)!;
    const out = await renderDiagram(block, { excalidraw: false });
    expect(out.svg).toMatch(/<svg/);
    expect(out.svg).not.toContain("failed to render");
  }, 30_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- api-diagram`
Expected: FAIL — `Cannot find module '../src/api-diagram.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/api-diagram.ts`:

```ts
import type { ApiProcedure, DiagramBlock } from "./blocks.js";

const FILL: Record<string, string> = {
  added: "#e6ffec",
  removed: "#ffebe9",
  changed: "#fffdf3",
};

function q(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function safeId(s: string): string {
  return s.replace(/[^A-Za-z0-9_]/g, "_");
}

function routerOf(name: string): { router: string; proc: string } {
  const i = name.indexOf(".");
  return i < 0 ? { router: "root", proc: name } : { router: name.slice(0, i), proc: name.slice(i + 1) };
}

/** Build an architecture diagram of the changed API surface (d2 floor + mermaid upgrade). */
export function apiSurfaceDiagram(
  procedures: ApiProcedure[],
  id = "api-surface",
  title = "API surface",
): DiagramBlock | null {
  if (procedures.length === 0) return null;

  const groups = new Map<string, { proc: string; change?: string }[]>();
  for (const p of procedures) {
    const { router, proc } = routerOf(p.name);
    const arr = groups.get(router) ?? [];
    arr.push({ proc, change: p.change });
    groups.set(router, arr);
  }

  // ---- d2 floor ----
  const d2: string[] = ["direction: right", "client"];
  for (const [router, procs] of groups) {
    const lines = [`${q(router)}: {`];
    for (const { proc, change } of procs) {
      lines.push(
        change && FILL[change]
          ? `  ${q(proc)}: { style.fill: ${q(FILL[change])} }`
          : `  ${q(proc)}`,
      );
    }
    lines.push("}");
    d2.push(lines.join("\n"));
    d2.push(`client -> ${q(router)}`);
  }

  // ---- mermaid upgrade ----
  const m: string[] = ["graph LR", "  client"];
  const classes: string[] = [];
  for (const [router, procs] of groups) {
    const rid = safeId(router);
    m.push(`  client --> ${rid}`);
    m.push(`  subgraph ${rid}[${router}]`);
    for (const { proc, change } of procs) {
      const nid = `${rid}_${safeId(proc)}`;
      m.push(`    ${nid}["${proc}"]`);
      if (change && FILL[change]) classes.push(`  class ${nid} ${change};`);
    }
    m.push("  end");
  }
  m.push("classDef added fill:#e6ffec;");
  m.push("classDef removed fill:#ffebe9;");
  m.push("classDef changed fill:#fffdf3;");
  m.push(...classes);

  return { type: "diagram", id, kind: "architecture", title, d2: d2.join("\n"), mermaid: m.join("\n") };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- api-diagram`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/api-diagram.ts test/api-diagram.test.ts
git commit -m "$(cat <<'EOF'
feat: API-surface architecture diagram producer (d2 + mermaid)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Emit the API-surface diagram in recaps

**Files:**
- Modify: `src/gather-recap.ts`
- Test: `test/gather-recap.test.ts` (add a case)

- [ ] **Step 1: Add the failing test**

In `test/gather-recap.test.ts`, add this import at the top (after the existing imports):

```ts
import type { ApiBlock } from "../src/blocks.js";
```

Then add this test inside the `describe("buildBlocks", ...)` block:

```ts
  it("emits an api-surface diagram before the api tables when procedures exist", async () => {
    const apiBlock: ApiBlock = {
      type: "api", id: "api", title: "API changes",
      procedures: [
        { name: "league.captureOrder", auth: "protected", kind: "mutation", input: "", change: "added" },
      ],
    };
    const adapter = {
      name: "fake",
      async detect() { return true; },
      async schemaDiff() { return null; },
      async apiDiff() { return [apiBlock]; },
    };
    const files = [{ path: "foo.ts", status: "M" as const, added: 1, deleted: 1 }];
    const blocks = await buildBlocks(scope, files, adapter);
    const diagramIdx = blocks.findIndex((b) => b.type === "diagram" && b.id === "api-surface");
    const apiIdx = blocks.findIndex((b) => b.type === "api");
    expect(diagramIdx).toBeGreaterThanOrEqual(0);
    expect(apiIdx).toBeGreaterThanOrEqual(0);
    expect(diagramIdx).toBeLessThan(apiIdx); // diagram precedes the table
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- gather-recap`
Expected: FAIL — no block with id `api-surface` exists yet (`diagramIdx` is -1).

- [ ] **Step 3: Write the implementation**

In `src/gather-recap.ts`, add the import after the existing imports:

```ts
import { apiSurfaceDiagram } from "./api-diagram.js";
```

Then replace this block:

```ts
  try {
    for (const api of await adapter.apiDiff(scope, onWarn)) blocks.push(api);
  } catch (err) {
    onWarn?.(`api diff skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
```

with:

```ts
  try {
    const apiBlocks = await adapter.apiDiff(scope, onWarn);
    const diagram = apiSurfaceDiagram(apiBlocks.flatMap((b) => b.procedures), "api-surface", "API surface");
    if (diagram) blocks.push(diagram);
    for (const api of apiBlocks) blocks.push(api);
  } catch (err) {
    onWarn?.(`api diff skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- gather-recap`
Expected: PASS (3 tests — the two existing plus the new one).

- [ ] **Step 5: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/gather-recap.ts test/gather-recap.test.ts
git commit -m "$(cat <<'EOF'
feat: emit API-surface diagram in recaps (before the API tables)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Testable Excalidraw seam in render-diagram

**Files:**
- Modify: `src/render-diagram.ts`
- Test: `test/render-excalidraw.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/render-excalidraw.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderDiagram } from "../src/render-diagram.js";
import type { DiagramBlock } from "../src/blocks.js";

const flow: DiagramBlock = {
  type: "diagram", id: "flow", title: "Flow", kind: "flowchart",
  d2: "a -> b", mermaid: "graph TD\nA-->B",
};

describe("renderDiagram excalidraw seam", () => {
  it("uses the injected excalidraw path when ready, writing a .excalidraw scene", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vs-exc-"));
    try {
      const out = await renderDiagram(
        flow,
        { outDir: dir },
        {
          ready: async () => true,
          convert: async () => ({ svg: "<svg id='fake'></svg>", scene: { type: "excalidraw" } }),
        },
      );
      expect(out.renderer).toBe("excalidraw");
      expect(out.svg).toContain("fake");
      expect(out.editable).toBe(join(dir, "flow.excalidraw"));
      const scene = JSON.parse(await readFile(join(dir, "flow.excalidraw"), "utf8"));
      expect(scene.type).toBe("excalidraw");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("falls back to the d2 floor when the injected conversion throws (and warns)", async () => {
    const warnings: string[] = [];
    const out = await renderDiagram(
      flow,
      { onWarn: (m) => warnings.push(m) },
      { ready: async () => true, convert: async () => { throw new Error("boom-exc"); } },
    );
    expect(out.renderer).toBe("d2");
    expect(out.svg).toMatch(/<svg/);
    expect(warnings.some((w) => w.includes("boom-exc"))).toBe(true);
  }, 30_000);

  it("never attempts the upgrade for an ineligible kind", async () => {
    let called = false;
    const erd: DiagramBlock = { type: "diagram", id: "e", title: "E", kind: "erd", d2: "a -> b", mermaid: "graph TD\nA-->B" };
    const out = await renderDiagram(
      erd,
      {},
      { ready: async () => true, convert: async () => { called = true; throw new Error("should not run"); } },
    );
    expect(called).toBe(false);
    expect(out.renderer).toBe("d2");
  }, 30_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- render-excalidraw`
Expected: FAIL — `renderDiagram` does not yet accept a third `deps` argument, so the injected `ready`/`convert` are ignored and `renderer` is `"d2"` in the first test.

- [ ] **Step 3: Write the implementation**

In `src/render-diagram.ts`, add this interface after the `RenderOpts` interface (around line 47):

```ts
/** Injectable seam for the Excalidraw browser path, so it can be unit-tested. */
export interface RenderDeps {
  ready?: () => Promise<boolean>;
  convert?: (mermaid: string) => Promise<{ svg: string; scene: unknown }>;
}
```

Change the `renderDiagram` signature from:

```ts
export async function renderDiagram(
  block: DiagramBlock | SchemaBlock,
  opts: RenderOpts = {},
): Promise<DiagramResult> {
```

to:

```ts
export async function renderDiagram(
  block: DiagramBlock | SchemaBlock,
  opts: RenderOpts = {},
  deps: RenderDeps = {},
): Promise<DiagramResult> {
  const ready = deps.ready ?? excalidrawReady;
  const convert = deps.convert ?? renderViaExcalidraw;
```

Then, in the upgrade block, replace:

```ts
  if (eligible && (await excalidrawReady())) {
    try {
      const { svg, scene } = await renderViaExcalidraw(mermaid!);
```

with:

```ts
  if (eligible && (await ready())) {
    try {
      const { svg, scene } = await convert(mermaid!);
```

Leave the rest of the function (scene write, fallback warning, return) unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- render-excalidraw`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/render-diagram.ts test/render-excalidraw.test.ts
git commit -m "$(cat <<'EOF'
refactor: injectable excalidraw seam in render-diagram for unit testing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Opt-in activation machinery (setup + offline bundle)

**Files:**
- Create: `scripts/excalidraw-entry.mjs`, `scripts/setup-excalidraw.mjs`, `assets/excalidraw-bundle.html`
- Modify: `package.json`, `.gitignore`, `README.md`

This task adds build/install tooling. It has no automated unit tests (the browser bundle is
verified manually in Task 7); the verification here is that the default install/test/typecheck
are unaffected.

- [ ] **Step 1: Create the bundle entry**

Create `scripts/excalidraw-entry.mjs`:

```js
// Bundled by scripts/setup-excalidraw.mjs into assets/excalidraw-bundle.js (IIFE).
// Exposes the two globals that src/render-diagram.ts reads inside page.evaluate.
import * as ExcalidrawLib from "@excalidraw/excalidraw";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";

window.ExcalidrawLib = ExcalidrawLib;
window.MermaidToExcalidrawLib = { parseMermaidToExcalidraw };
```

- [ ] **Step 2: Create the offline bundle page**

Create `assets/excalidraw-bundle.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>excalidraw bundle</title>
    <script src="excalidraw-bundle.js"></script>
  </head>
  <body></body>
</html>
```

- [ ] **Step 3: Create the setup script**

Create `scripts/setup-excalidraw.mjs`:

```js
#!/usr/bin/env node
// Opt-in installer for the Excalidraw editable-diagram upgrade. Heavy deps live
// here, NOT in the default install. Run with: npm run setup:excalidraw
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", cwd: root });

const PINNED = [
  "@excalidraw/excalidraw@^0.18.0",
  "@excalidraw/mermaid-to-excalidraw@^1.1.2",
  "react@^18.3.1",
  "react-dom@^18.3.1",
  "playwright@^1.48.0",
  "esbuild@^0.24.0",
];

console.log("Installing opt-in Excalidraw deps (not saved to package.json)...");
run("npm", ["install", "--no-save", ...PINNED]);

console.log("Installing Chromium for Playwright...");
run("npx", ["playwright", "install", "chromium"]);

console.log("Bundling the offline Excalidraw page...");
const esbuild = await import("esbuild");
await esbuild.build({
  entryPoints: [join(root, "scripts", "excalidraw-entry.mjs")],
  bundle: true,
  format: "iife",
  outfile: join(root, "assets", "excalidraw-bundle.js"),
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
});

console.log("Done. The editable upgrade is now active for flowchart/architecture diagrams.");
```

- [ ] **Step 4: Ignore the generated bundle**

In `.gitignore`, add a line:

```
assets/excalidraw-bundle.js
```

- [ ] **Step 5: Add the npm script**

In `package.json`, add to the `scripts` object (after the `recap` script):

```json
    "setup:excalidraw": "node scripts/setup-excalidraw.mjs",
```

- [ ] **Step 6: Document the opt-in in the README**

In `README.md`, add a section near the prerequisites:

```markdown
## Optional: editable Excalidraw diagrams

By default, flowchart/architecture diagrams render as static D2 sketches. To make them
editable `.excalidraw` scenes (opened in excalidraw.com or the VS Code Excalidraw
extension), opt in once:

    npm run setup:excalidraw

This installs Playwright + Chromium and `@excalidraw/excalidraw` (not saved to
`package.json`) and builds an offline bundle. It is heavy (~hundreds of MB). When it is
not installed, diagrams fall back to the D2 sketch — nothing breaks.
```

- [ ] **Step 7: Confirm the default path is unaffected**

Run: `npm run typecheck && npm test`
Expected: no type errors; all tests pass (the new files are tooling/assets; `excalidrawReady()` still returns false because `assets/excalidraw-bundle.js` is absent, so behavior is unchanged).

- [ ] **Step 8: Commit**

```bash
git add scripts/excalidraw-entry.mjs scripts/setup-excalidraw.mjs assets/excalidraw-bundle.html package.json .gitignore README.md
git commit -m "$(cat <<'EOF'
feat: opt-in setup script + offline bundle for editable excalidraw diagrams

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Verification + manual Excalidraw check

**Files:** none (verification only)

- [ ] **Step 1: Full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: every test passes; no type errors.

- [ ] **Step 2: Recap regression (now with the API-surface diagram)**

Run:

```bash
npm run recap -- --repo /Users/scottrogener/Projects/ppgl --commit 3559f61 --out /tmp/recap-m3.html 2>/tmp/recap-m3.err
echo "--- exit=$? ---"
echo "--- stderr (expect empty) ---"; cat /tmp/recap-m3.err
echo "--- script tags (expect 0) ---"; grep -c "<script" /tmp/recap-m3.html
echo "--- api-surface diagram present (expect >=1) ---"; grep -c 'vs-diagram' /tmp/recap-m3.html
echo "--- svg present (expect >=1) ---"; grep -c "<svg" /tmp/recap-m3.html
echo "--- placeholder leaks (expect 0) ---"; grep -c "failed to render" /tmp/recap-m3.html
```

Expected: exit 0; stderr empty; `<script>` count 0; at least one `vs-diagram` section and `<svg`; zero "failed to render" (the generated API-surface d2 compiles). Note: `--pr` is unavailable here because the `gh` CLI is absent; `--commit 3559f61` is the canonical equivalent.

- [ ] **Step 3: Plan promotion smoke test**

Run:

```bash
cat > /tmp/m3-plan.json <<'EOF'
[
  { "type": "prose", "id": "intro", "markdown": "Flow below.\n\n```mermaid\ngraph TD\nA[Start]-->B[End]\n```\n\nDone." }
]
EOF
npm run plan -- --blocks /tmp/m3-plan.json --title "M3 smoke" --out /tmp/m3-plan.html 2>/tmp/m3-plan.err
echo "--- exit=$? ---"; cat /tmp/m3-plan.err
echo "--- diagram section present (expect >=1) ---"; grep -c "vs-diagram" /tmp/m3-plan.html
echo "--- svg present (expect >=1) ---"; grep -c "<svg" /tmp/m3-plan.html
echo "--- no placeholder (expect 0) ---"; grep -c "failed to render" /tmp/m3-plan.html
```

Expected: exit 0; one `vs-diagram` section with an `<svg` (the promoted flowchart rendered via the D2 floor); zero "failed to render".

- [ ] **Step 4: Manual Excalidraw verification (on the user's machine)**

This step is run by the human partner, not the implementer subagent. Document the result; do not block the milestone on it in this environment.

```bash
npm run setup:excalidraw   # one-time, heavy
npm run plan -- --blocks /tmp/m3-plan.json --title "M3 excalidraw" --out /tmp/m3-exc.html
ls /tmp/*.excalidraw 2>/dev/null && echo "scene written" || echo "no scene (check setup)"
open /tmp/m3-exc.html   # confirm the inline diagram + an 'open in Excalidraw' link
```

Expected (after opt-in): a `.excalidraw` sidecar is written next to the output, the inline
SVG renders, and the `.excalidraw` opens/edits in excalidraw.com or the VS Code Excalidraw
extension. If the esbuild bundle needs adjustment, iterate on `scripts/excalidraw-entry.mjs`
/ `scripts/setup-excalidraw.mjs` here (the path degrades to D2 until it works, so output is
never broken).

- [ ] **Step 5: Final commit (only if anything changed)**

If Steps 1–3 surfaced a fix, commit it with the required co-author trailer. Otherwise there
is nothing to commit — the automated portion of M3 is complete, with the manual Excalidraw
check (Step 4) remaining for the user's machine.

---

## Notes for the Implementer

- **Producers render via the D2 floor immediately.** M3.2/M3.3 deliver value without the
  Excalidraw opt-in; the editable upgrade only adds the `.excalidraw` sidecar once
  `setup:excalidraw` has been run.
- **Graceful degradation is a hard requirement.** No path may crash when the Excalidraw
  toolchain is absent (`excalidrawReady()` returns false → D2 floor) or when a mermaid fence
  is unconvertible (left inline as a code block) or when generated d2 fails (placeholder SVG).
- **Quote all D2 keys/values** in generated sources (names contain dots) — the compile-through-`d2`
  tests guard this (and assert the SVG is not the "failed to render" placeholder).
- **Run single tests** during a task; run the full suite in Tasks 4, 5, 6, and 7.
