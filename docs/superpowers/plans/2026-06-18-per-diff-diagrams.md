# Per-Diff Diagrams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a diff carry an optional illustration — a single `DiagramBlock` or a `TabsBlock` of diagrams — rendered after its description and above its hunks.

**Architecture:** `DiffBlock` gains `diagram?: DiagramBlock | TabsBlock`. d2 compilation stays in `assemble`'s up-front pass: `collectDiagrams`/`assertUniqueIds` recurse through `diff.diagram`, and `assemble`'s `case "diff"` builds the embed (a single diagram via a new `diagramInner` helper, or a tabs set via the existing `renderBlock`) and passes pre-rendered HTML into `renderDiff`. The bare CLI never sets `diagram`; the visual-recap agent fills it during enrichment.

**Tech Stack:** TypeScript (NodeNext ESM, `.js` import specifiers), vitest, the `d2` binary, the M8 `TabsBlock` + diagram catalog.

---

## File Structure

- `src/blocks.ts` — **modify.** Add `diagram?: DiagramBlock | TabsBlock` to `DiffBlock`.
- `src/assemble.ts` — **modify.** Extract `diagramInner`; recurse into `diff.diagram` in `assertUniqueIds`/`collectDiagrams`; build the embed in `case "diff"`.
- `src/renderers/diff.ts` — **modify.** `renderDiff` gains a third optional `diagramHtml` arg, inserted between the description and the hunks.
- `assets/template.css` — **modify.** `.vs-diff-diagram` styling.
- `skills/visual-recap/SKILL.md` — **modify.** Per-diff diagram guidance (single + tabs, editability, restraint).
- `test/diff.test.ts`, `test/assemble.test.ts`, `test/skill-docs.test.ts` — **modify.** New assertions.

---

## Task 1: `DiffBlock.diagram` type + collection/uniqueness recursion

**Files:**
- Modify: `src/blocks.ts` (the `DiffBlock` interface, ~lines 55-62)
- Modify: `src/assemble.ts` (`assertUniqueIds` ~lines 30-38; `collectDiagrams` ~lines 43-50)
- Test: `test/assemble.test.ts`

This task adds the field and the recursion so an embedded diagram is rendered up front and its
id is uniqueness-checked. The actual in-diff *placement* comes in Task 2 — so for this task the
embedded diagram is *collected* (run through the up-front render pass) but `renderDiff` does not
yet place its svg in the output. The Task 1 tests therefore assert collection + uniqueness via
observable side effects that don't depend on placement: collection is proven by a broken-d2
embedded diagram emitting an `onWarn` (which only fires if it was actually collected and rendered),
and uniqueness by the duplicate-id throw.

- [ ] **Step 1: Write the failing tests**

Append this `describe` block at the end of `test/assemble.test.ts` (before EOF):

```ts
describe("assemble — per-diff diagram (collection & uniqueness)", () => {
  it("collects a diagram embedded on a diff into the up-front render pass", async () => {
    // A broken d2 source only produces a warning if the embedded diagram was actually
    // collected and run through renderAll — so this proves collectDiagrams recursed into it.
    const warnings: string[] = [];
    const blocks: Block[] = [
      {
        type: "diff", id: "d0", title: "x.ts", path: "src/x.ts",
        diagram: { type: "diagram", id: "d0-diag", title: "Flow", kind: "flowchart", d2: "x: {" },
        hunks: [{ header: "@@", lines: ["+a"] }],
      },
    ];
    await assemble(blocks, { title: "T", source: "s", onWarn: (m) => warnings.push(m) });
    expect(warnings.some((w) => w.includes("d0-diag"))).toBe(true);
  }, 30_000);

  it("throws when a diff's embedded diagram id duplicates another block id", async () => {
    const blocks: Block[] = [
      { type: "prose", id: "dup", markdown: "x" },
      {
        type: "diff", id: "d0", title: "x.ts", path: "src/x.ts",
        diagram: { type: "diagram", id: "dup", title: "Flow", kind: "flowchart", d2: "a -> b" },
        hunks: [{ header: "@@", lines: ["+a"] }],
      },
    ];
    await expect(assemble(blocks, { title: "T", source: "s" })).rejects.toThrow(/duplicate block id "dup"/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- assemble`
Expected: FAIL — TypeScript rejects the `diagram` property on a `DiffBlock` (not yet in the type), and at runtime the embedded diagram is neither collected nor uniqueness-checked.

- [ ] **Step 3: Add the `diagram` field to `DiffBlock`**

In `src/blocks.ts`, change the `DiffBlock` interface from:

```ts
export interface DiffBlock {
  type: "diff";
  id: string;
  title: string;
  path: string;
  description?: string;  // optional markdown "what & why", rendered above the hunks
  hunks: DiffHunk[];
}
```

to (add the one `diagram?` line):

```ts
export interface DiffBlock {
  type: "diff";
  id: string;
  title: string;
  path: string;
  description?: string;  // optional markdown "what & why", rendered above the hunks
  diagram?: DiagramBlock | TabsBlock; // optional illustration (one diagram, or a tabbed set), rendered after the description, above the hunks
  hunks: DiffHunk[];
}
```

`DiagramBlock` and `TabsBlock` are declared elsewhere in the same module; interface field types
resolve regardless of declaration order, so no reordering is needed.

- [ ] **Step 4: Recurse into `diff.diagram` in `assertUniqueIds` and `collectDiagrams`**

In `src/assemble.ts`, update `assertUniqueIds`. Change:

```ts
    if (b.type === "group") assertUniqueIds(b.blocks, seen);
    else if (b.type === "tabs") assertUniqueIds(b.tabs.map((t) => t.block), seen);
```

to add a `diff` branch:

```ts
    if (b.type === "group") assertUniqueIds(b.blocks, seen);
    else if (b.type === "tabs") assertUniqueIds(b.tabs.map((t) => t.block), seen);
    else if (b.type === "diff" && b.diagram) assertUniqueIds([b.diagram], seen);
```

Then update `collectDiagrams`. Change:

```ts
      if (isDiagramBlock(b)) out.push(b);
      else if (b.type === "group") out.push(...collectDiagrams(b.blocks));
      else if (b.type === "tabs") out.push(...collectDiagrams(b.tabs.map((t) => t.block)));
```

to add a `diff` branch:

```ts
      if (isDiagramBlock(b)) out.push(b);
      else if (b.type === "group") out.push(...collectDiagrams(b.blocks));
      else if (b.type === "tabs") out.push(...collectDiagrams(b.tabs.map((t) => t.block)));
      else if (b.type === "diff" && b.diagram) out.push(...collectDiagrams([b.diagram]));
```

(Recursing through `[b.diagram]` handles both a `DiagramBlock` — pushed directly by
`isDiagramBlock` — and a `TabsBlock` — gathered by recursing into its tabs.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- assemble` then `npm run typecheck`
Expected: PASS (all assemble tests, including the two new ones); typecheck clean. The collection
test passes because `collectDiagrams` now recurses into `b.diagram`, so the broken-d2 embedded
diagram is run through `renderAll` and emits the `onWarn`. The duplicate-id test passes because
`assertUniqueIds` now recurses into `b.diagram`.

- [ ] **Step 6: Commit**

```bash
git add src/blocks.ts src/assemble.ts test/assemble.test.ts
git commit -m "feat: DiffBlock.diagram field + collection/uniqueness recursion

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Render the embedded diagram inside the diff card

**Files:**
- Modify: `src/assemble.ts` (`case "diagram"`/`case "schema"` ~lines 69-78; `case "diff"` ~line 81)
- Modify: `src/renderers/diff.ts` (`renderDiff` signature + body)
- Modify: `assets/template.css`
- Test: `test/diff.test.ts`, `test/assemble.test.ts`

- [ ] **Step 1: Write the failing tests**

First, in `test/diff.test.ts`, add these tests. (The file already imports `renderDiff` and uses
vitest `describe/it/expect` — match that. If it lacks a top-level `describe`, wrap these in one.)

```ts
import { describe, it, expect } from "vitest";
import { renderDiff } from "../src/renderers/diff.js";
import type { DiffBlock } from "../src/blocks.js";

describe("renderDiff — embedded diagram fragment", () => {
  const base: DiffBlock = {
    type: "diff", id: "d", title: "x.ts", path: "src/x.ts",
    description: "Changes **here**.",
    hunks: [{ header: "@@ -1 +1 @@", lines: ["+const a = 1;"] }],
  };

  it("places the diagram fragment after the description and before the first hunk", async () => {
    const html = await renderDiff(base, undefined, "<div class='vs-diff-diagram'>DIAG</div>");
    const descIdx = html.indexOf("vs-diff-desc");
    const diagIdx = html.indexOf("vs-diff-diagram");
    const hunkIdx = html.indexOf("vs-hunk");
    expect(descIdx).toBeGreaterThanOrEqual(0);
    expect(diagIdx).toBeGreaterThan(descIdx);
    expect(hunkIdx).toBeGreaterThan(diagIdx);
  });

  it("is unchanged when no diagram fragment is passed", async () => {
    const withArg = await renderDiff(base, undefined, "");
    const withoutArg = await renderDiff(base);
    expect(withArg).toBe(withoutArg);
    expect(withArg).not.toContain("vs-diff-diagram");
  });
});
```

Then, in `test/assemble.test.ts`, add these tests to the `describe("assemble — per-diff diagram ...")`
block (or a new describe) — they assert placement and the tabs case:

```ts
  it("places a single embedded diagram's svg inside the vs-diff section", async () => {
    const blocks: Block[] = [
      {
        type: "diff", id: "d1", title: "x.ts", path: "src/x.ts",
        diagram: { type: "diagram", id: "d1-diag", title: "Flow", kind: "flowchart", d2: "a -> b" },
        hunks: [{ header: "@@", lines: ["+a"] }],
      },
    ];
    const html = await assemble(blocks, { title: "T", source: "s" });
    const sectionStart = html.indexOf('class="vs-block vs-diff"');
    const sectionEnd = html.indexOf("</section>", sectionStart);
    const section = html.slice(sectionStart, sectionEnd);
    expect(section).toContain("vs-diff-diagram");
    expect(section).toContain("<svg");
  });

  it("renders a tabs set embedded on a diff (multiple svgs, tab switcher)", async () => {
    const blocks: Block[] = [
      {
        type: "diff", id: "d2", title: "x.ts", path: "src/x.ts",
        diagram: {
          type: "tabs", id: "d2-views", title: "Views", tabs: [
            { label: "Flow", block: { type: "diagram", id: "d2-flow", title: "Flow", kind: "flowchart", d2: "a -> b" } },
            { label: "Seq", block: { type: "diagram", id: "d2-seq", title: "Seq", kind: "sequence", d2: "shape: sequence_diagram\na -> b: hi" } },
          ],
        },
        hunks: [{ header: "@@", lines: ["+a"] }],
      },
    ];
    const html = await assemble(blocks, { title: "T", source: "s" });
    expect(html).toContain("vs-diff-diagram");
    expect(html).toContain('class="vs-block vs-tabs"');
    expect((html.match(/<svg/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain("<script");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- diff` and `npm test -- assemble`
Expected: FAIL — `renderDiff` does not yet accept a third arg / place the fragment; the assemble
embed for `case "diff"` does not yet build `diagramHtml`.

- [ ] **Step 3: Add the `diagramHtml` arg to `renderDiff`**

In `src/renderers/diff.ts`, change the `renderDiff` signature and body. Replace:

```ts
export async function renderDiff(
  block: DiffBlock,
  onWarn?: (msg: string) => void,
): Promise<string> {
  const lang = langFromPath(block.path);
  const desc = block.description
    ? `<div class="vs-diff-desc">${await renderMarkdown(block.description, onWarn)}</div>`
    : "";
  const hunks = await Promise.all(block.hunks.map((h) => renderHunk(h, lang, onWarn)));
  return (
    `<section class="vs-block vs-diff">` +
    `<h2>${escapeHtml(block.title)}</h2>` +
    `<div class="vs-path">${escapeHtml(block.path)}</div>` +
    desc +
    hunks.join("") +
    `</section>`
  );
}
```

with:

```ts
export async function renderDiff(
  block: DiffBlock,
  onWarn?: (msg: string) => void,
  diagramHtml = "",
): Promise<string> {
  const lang = langFromPath(block.path);
  const desc = block.description
    ? `<div class="vs-diff-desc">${await renderMarkdown(block.description, onWarn)}</div>`
    : "";
  const hunks = await Promise.all(block.hunks.map((h) => renderHunk(h, lang, onWarn)));
  return (
    `<section class="vs-block vs-diff">` +
    `<h2>${escapeHtml(block.title)}</h2>` +
    `<div class="vs-path">${escapeHtml(block.path)}</div>` +
    desc +
    diagramHtml +
    hunks.join("") +
    `</section>`
  );
}
```

(The pre-rendered `diagramHtml` is trusted assembler output — its SVG comes from the d2/Excalidraw
renderer, like every other diagram — so it is inserted as-is, exactly as the existing `desc`/`r.svg`
fragments are.)

- [ ] **Step 4: Extract `diagramInner` and build the embed in `assemble`**

In `src/assemble.ts`, add the `diagramInner` helper next to `withAnchor` (after the `withAnchor`
definition, ~line 64):

```ts
  // svg + optional editable link, without the outer <section> — reused by diagram blocks and by
  // a diagram embedded inside a diff.
  const diagramInner = (r: (typeof rendered)[number]): string => {
    const link = r.editable
      ? `<div class="vs-edit"><a href="${escapeHtml(basename(r.editable))}">open in Excalidraw</a></div>`
      : "";
    return `${r.svg}${link}`;
  };
```

Replace the existing `case "diagram"` / `case "schema"` body:

```ts
      case "diagram":
      case "schema": {
        const r = svgById.get(b.id)!;
        const link = r.editable
          ? `<div class="vs-edit"><a href="${escapeHtml(basename(r.editable))}">open in Excalidraw</a></div>`
          : "";
        // r.svg is trusted: produced by the d2 binary (or Excalidraw), which emit no <script>.
        html = `<section class="vs-block vs-diagram"><h2>${escapeHtml(b.title)}</h2>${r.svg}${link}</section>`;
        break;
      }
```

with the version that uses the helper:

```ts
      case "diagram":
      case "schema": {
        const r = svgById.get(b.id)!;
        // r.svg is trusted: produced by the d2 binary (or Excalidraw), which emit no <script>.
        html = `<section class="vs-block vs-diagram"><h2>${escapeHtml(b.title)}</h2>${diagramInner(r)}</section>`;
        break;
      }
```

Replace the existing `case "diff"` body:

```ts
      case "diff": html = await renderDiff(b, opts.onWarn); break;
```

with the version that builds the embed (single diagram via `diagramInner`, tabs via `renderBlock`):

```ts
      case "diff": {
        let diagramHtml = "";
        if (b.diagram?.type === "diagram") {
          diagramHtml = `<div class="vs-diff-diagram"><h3>${escapeHtml(b.diagram.title)}</h3>${diagramInner(svgById.get(b.diagram.id)!)}</div>`;
        } else if (b.diagram?.type === "tabs") {
          diagramHtml = `<div class="vs-diff-diagram">${await renderBlock(b.diagram)}</div>`;
        }
        html = await renderDiff(b, opts.onWarn, diagramHtml);
        break;
      }
```

(`renderBlock` is the enclosing recursive closure — it already renders a `tabs` block, looking up
each tab's pre-rendered diagram in `svgById`.)

- [ ] **Step 5: Add the CSS**

Append to `assets/template.css`:

```css
/* ── per-diff embedded diagram ────────────────────────────────────────────── */
.vs-diff-diagram { margin: 12px 0; }
.vs-diff-diagram > h3 { margin: 0 0 6px; font-size: 0.95rem; font-weight: 600; color: #57534e; }
.vs-diff-diagram svg { max-width: 100%; height: auto; }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- diff`, `npm test -- assemble`, then `npm run typecheck`
Expected: PASS (diff placement tests, assemble single + tabs embed tests, and the Task-1
collection/uniqueness tests all green); typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/assemble.ts src/renderers/diff.ts assets/template.css test/diff.test.ts test/assemble.test.ts
git commit -m "feat: render a diff's embedded diagram (single or tabs) above the hunks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Skill guidance + docs

**Files:**
- Modify: `skills/visual-recap/SKILL.md`
- Test: `test/skill-docs.test.ts`

- [ ] **Step 1: Write the failing test**

In `test/skill-docs.test.ts`, add this test inside the top-level `describe("skill docs stay in sync", ...)`
block (after the existing `it(...)` cases):

```ts
  it("visual-recap documents attaching a diagram to a diff", () => {
    expect(recapSkill).toContain('"diagram":');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- skill-docs`
Expected: FAIL — the recap skill does not yet contain the `"diagram":` per-diff guidance.

- [ ] **Step 3: Add the per-diff diagram guidance to visual-recap**

In `skills/visual-recap/SKILL.md`, find the "Add context (make it a review narrative)" section.
After step 4 (the "Annotate each diff" step that sets each diff's `description`), insert a new
step. The existing step reads approximately:

```markdown
4. **Annotate each diff.** Set each diff block's `description` (markdown) to *what changes in
   this file and why*. Cross-link related diffs by their block id, which you can see in the
   emitted JSON, e.g. `See [the router](#diff-3).` (each block renders with `id="<its id>"`,
   so `#diff-3` jumps to that diff).
```

Insert immediately after it (renumber the following steps if they are numbered — or add it as a
clearly-labeled sub-step so numbering stays consistent):

```markdown
4b. **Illustrate a diff when it helps.** When a single diff implements logic that's clearer shown
   than read — a new state machine, a non-obvious control/data flow, a sequence across
   collaborators — attach a small catalog diagram as that diff's `diagram`:

       "diagram": { "type": "diagram", "id": "diff-3-diag", "title": "Capture flow", "kind": "sequence",
         "d2": "shape: sequence_diagram\napi -> paypal: capture(id)\npaypal -> api: ok",
         "mermaid": "sequenceDiagram\n  api->>paypal: capture(id)\n  paypal-->>api: ok" }

   - **Restraint:** most diffs need none — attach one only when it adds understanding the code
     alone doesn't.
   - **Keep it editable:** copy the catalog recipe *including its `mermaid` sibling* for any
     editable-eligible kind (flowchart/architecture/sequence/class), so the diagram renders as an
     editable Excalidraw scene; a d2-only diagram forfeits that (ERD stays d2-only by design).
   - **Multiple views:** if one diff genuinely needs more than one diagram, set `diagram` to a
     `tabs` block of diagrams instead (default to a single diagram). A diagram inside a non-default
     tab is hidden until clicked, so don't make it a `#cross-link` target.
   - A `group` of diffs can likewise lead with a `diagram` (or a `tabs`) block to illustrate the
     whole grouping.
```

- [ ] **Step 4: Run the test + full suite**

Run: `npm test -- skill-docs`, then `npm test`, then `npm run typecheck`
Expected: PASS — the new skill-docs test passes; full suite green; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add skills/visual-recap/SKILL.md test/skill-docs.test.ts
git commit -m "docs: visual-recap guidance for attaching diagrams to diffs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] `npm test` — all green (incl. new diff/assemble/skill-docs cases).
- [ ] `npm run typecheck` — clean.
- [ ] Manual smoke: author a `blocks.json` with a `diff` whose `diagram` is a single `DiagramBlock`,
  and another `diff` whose `diagram` is a `TabsBlock` of two diagrams; run
  `npx tsx bin/plan.ts --blocks blocks.json --out /tmp/diff-diag`, open `/tmp/diff-diag/plan.html`,
  and confirm: the single diagram renders above the hunks inside the diff card; the tabs set
  switches with no JS; no placeholders; no `<script>`.
