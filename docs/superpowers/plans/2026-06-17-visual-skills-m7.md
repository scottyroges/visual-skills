# Visual Skills M7 — Review-Narrative Recaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recaps read like a presentation — a titled "Summary", per-file diff descriptions with cross-links, and importance-ordered `group`s — with the intelligence in the `visual-recap` skill and small tool enablers behind it.

**Architecture:** Tool enablers (a shared `renderMarkdown` helper, prose-title rendering, `DiffBlock.description`, section `id` anchors, a nesting `GroupBlock`, a "Summary"-titled mechanical summary). The `visual-recap` skill reads the diff+code and authors the Summary, per-diff descriptions, cross-links, and ordered groups, then renders via `plan`. The bare `recap` CLI stays mechanical.

**Tech Stack:** TypeScript ESM (`tsx`), vitest, marked + sanitize-html + shiki, the `d2` binary.

**Commit convention:** Every commit message MUST end with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

**Spec:** `docs/superpowers/specs/2026-06-17-visual-skills-m7-design.md`

---

## File Structure

- **Create** `src/renderers/markdown.ts` — `renderMarkdown(md, onWarn?)`: the marked+Shiki+sanitize pipeline (extracted from prose).
- **Modify** `src/renderers/prose.ts` — use `renderMarkdown`; render the optional title as `<h2>`.
- **Modify** `src/blocks.ts` — `DiffBlock.description?`; new `GroupBlock`.
- **Modify** `src/renderers/diff.ts` — render `description` (markdown) above the hunks.
- **Modify** `src/assemble.ts` — recursive `renderBlock` + `collectDiagrams` + `withAnchor` (id anchors) + `group` case.
- **Modify** `src/gather-recap.ts` — title the mechanical summary "Summary".
- **Modify** `assets/template.css` — `.vs-diff-desc`, `.vs-group` rules.
- **Modify** `skills/visual-recap/SKILL.md` (the intelligence rewrite), `skills/visual-plan/SKILL.md` (document `group`), `test/skill-docs.test.ts`.
- **Tests:** create `test/markdown.test.ts`; modify `test/prose.test.ts`, `test/diff.test.ts`, `test/assemble.test.ts`, `test/gather-recap.test.ts`, `test/skill-docs.test.ts`.

---

## Task 1: Shared markdown helper

**Files:**
- Create: `src/renderers/markdown.ts`
- Modify: `src/renderers/prose.ts`
- Test: `test/markdown.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/markdown.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../src/renderers/markdown.js";

describe("renderMarkdown", () => {
  it("keeps a #fragment cross-link (for in-page anchors)", async () => {
    const html = await renderMarkdown("see [there](#diff-3)");
    expect(html).toContain('href="#diff-3"');
  });

  it("strips scripts, event handlers, and javascript: URLs", async () => {
    const html = await renderMarkdown('<script>x</script>\n\n<a href="javascript:1" onclick="y">z</a>');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
  });

  it("syntax-highlights fenced code", async () => {
    const html = await renderMarkdown("```ts\nconst x = 1;\n```");
    expect(html).toContain('class="shiki');
    expect(html).toContain('style="color:');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- markdown.test`
Expected: FAIL — `Cannot find module '../src/renderers/markdown.js'`.

- [ ] **Step 3: Create the helper**

Create `src/renderers/markdown.ts`:

```ts
import { Marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { highlightCode } from "../highlight.js";
import { escapeHtml } from "../html.js";

const HEX_OR_RGB = [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/i];

const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "li", "blockquote",
    "pre", "code", "span", "a", "em", "strong", "del", "hr", "br",
    "table", "thead", "tbody", "tr", "th", "td", "img",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    img: ["src", "alt"],
    pre: ["class", "style"],
    code: ["class", "style"],
    span: ["class", "style"],
  },
  allowedStyles: { "*": { color: HEX_OR_RGB, "background-color": HEX_OR_RGB } },
  allowedSchemes: ["http", "https", "mailto"],
};

/**
 * Render GitHub-flavored Markdown to sanitized inner HTML (no wrapping element):
 * Shiki-highlighted fenced code, in-page `#fragment` cross-links preserved, and
 * scripts / event handlers / javascript: URLs stripped.
 */
export async function renderMarkdown(
  markdown: string,
  onWarn?: (msg: string) => void,
): Promise<string> {
  const md = new Marked({ async: true });
  md.use({
    async: true,
    walkTokens: async (token) => {
      if (token.type === "code") {
        const t = token as { text: string; lang?: string; highlighted?: string };
        t.highlighted = await highlightCode(t.text, t.lang || "text", onWarn);
      }
    },
    renderer: {
      code(token) {
        const t = token as { text: string; highlighted?: string };
        return t.highlighted ?? `<pre class="shiki-plain">${escapeHtml(t.text)}</pre>`;
      },
    },
  });
  const body = (await md.parse(markdown)) as string;
  return sanitizeHtml(body, SANITIZE_OPTS);
}
```

- [ ] **Step 4: Refactor prose.ts to use it**

Replace the entire contents of `src/renderers/prose.ts` with:

```ts
import type { ProseBlock } from "../blocks.js";
import { renderMarkdown } from "./markdown.js";

export async function renderProse(
  block: ProseBlock,
  onWarn?: (msg: string) => void,
): Promise<string> {
  const body = await renderMarkdown(block.markdown, onWarn);
  return `<section class="vs-block vs-prose">${body}</section>`;
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- markdown.test prose.test`
Expected: PASS — markdown (3 tests) and the existing prose tests (prose output is unchanged: still `<section class="vs-block vs-prose">…`).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck` (expect clean), then:

```bash
git add src/renderers/markdown.ts src/renderers/prose.ts test/markdown.test.ts
git commit -m "$(cat <<'EOF'
refactor: extract shared renderMarkdown helper (used by prose, soon diffs)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Prose title heading

**Files:**
- Modify: `src/renderers/prose.ts`
- Test: `test/prose.test.ts`

- [ ] **Step 1: Add the failing tests**

In `test/prose.test.ts`, add inside the existing `describe("renderProse", …)` block:

```ts
  it("renders the title as a heading when present", async () => {
    const html = await renderProse({ type: "prose", id: "s", title: "Summary", markdown: "body" });
    expect(html).toContain("<h2>Summary</h2>");
  });

  it("renders no heading when the title is absent", async () => {
    const html = await renderProse({ type: "prose", id: "s", markdown: "body" });
    expect(html).not.toContain("<h2");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- prose.test`
Expected: FAIL — the title test fails (no `<h2>Summary</h2>` today).

- [ ] **Step 3: Implement**

Replace the entire contents of `src/renderers/prose.ts` with:

```ts
import type { ProseBlock } from "../blocks.js";
import { renderMarkdown } from "./markdown.js";
import { escapeHtml } from "../html.js";

export async function renderProse(
  block: ProseBlock,
  onWarn?: (msg: string) => void,
): Promise<string> {
  const body = await renderMarkdown(block.markdown, onWarn);
  const heading = block.title ? `<h2>${escapeHtml(block.title)}</h2>` : "";
  return `<section class="vs-block vs-prose">${heading}${body}</section>`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- prose.test`
Expected: PASS (all prose tests, incl. the two new ones).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (expect clean), then:

```bash
git add src/renderers/prose.ts test/prose.test.ts
git commit -m "$(cat <<'EOF'
feat: render the prose block title as a heading

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Per-file diff description (markdown + cross-links)

**Files:**
- Modify: `src/blocks.ts`, `src/renderers/diff.ts`, `assets/template.css`
- Test: `test/diff.test.ts`

- [ ] **Step 1: Add the failing test**

In `test/diff.test.ts`, add inside the existing `describe("renderDiff", …)` block:

```ts
  it("renders a markdown description with cross-links above the hunks", async () => {
    const block: DiffBlock = {
      type: "diff", id: "d", title: "x.ts", path: "src/x.ts",
      description: "Switches checkout to PayPal. See [the router](#diff-1).",
      hunks: [{ header: "@@ -1 +1 @@", lines: ["+const a = 1;"] }],
    };
    const html = await renderDiff(block);
    expect(html).toContain('class="vs-diff-desc"');
    expect(html).toContain('href="#diff-1"');
    expect(html.indexOf("vs-diff-desc")).toBeLessThan(html.indexOf("vs-hunk")); // desc before hunks
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- diff.test`
Expected: FAIL — `description` is not a known property and no `vs-diff-desc` is rendered.

- [ ] **Step 3: Add the field to the type**

In `src/blocks.ts`, change the `DiffBlock` interface to add `description`:

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

- [ ] **Step 4: Render it in the diff renderer**

In `src/renderers/diff.ts`, add the import:

```ts
import { renderMarkdown } from "./markdown.js";
```

Replace the `renderDiff` function with:

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

- [ ] **Step 5: CSS**

Append to `assets/template.css`:

```css
.vs-diff-desc { background:#fffdf3; border-left:3px solid var(--line); padding:6px 10px;
  margin:6px 0 10px; font-size:0.92em; }
.vs-diff-desc p { margin:4px 0; }
```

- [ ] **Step 6: Run + typecheck**

Run: `npm test -- diff.test && npm run typecheck`
Expected: diff tests PASS (incl. the new one); no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/blocks.ts src/renderers/diff.ts assets/template.css test/diff.test.ts
git commit -m "$(cat <<'EOF'
feat: DiffBlock.description — per-file what/why markdown above the hunks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: GroupBlock + assemble (recursion, anchors, group case)

**Files:**
- Modify: `src/blocks.ts`, `src/assemble.ts`, `assets/template.css`, `skills/visual-plan/SKILL.md`
- Test: `test/assemble.test.ts`

- [ ] **Step 1: Add the failing tests**

In `test/assemble.test.ts`, add inside the existing `describe("assemble", …)` block:

```ts
  it("renders a group with nested blocks, anchors, and a nested diagram", async () => {
    const blocks: Block[] = [
      { type: "prose", id: "summary", title: "Summary", markdown: "hi" },
      { type: "group", id: "g1", title: "Core change", blocks: [
        { type: "diagram", id: "flow", title: "Flow", kind: "flowchart", d2: "a -> b" },
        { type: "diff", id: "diff-0", title: "x.ts", path: "src/x.ts", hunks: [{ header: "@@", lines: ["+a"] }] },
      ] },
    ];
    const html = await assemble(blocks, { title: "T", source: "s" });
    expect(html).toContain('class="vs-block vs-group"');
    expect(html).toContain("Core change");
    expect(html).toContain('id="g1"');     // group anchor
    expect(html).toContain('id="flow"');   // nested diagram anchor
    expect(html).toContain('id="diff-0"'); // nested diff anchor
    expect(html).toContain("<svg");        // nested diagram actually rendered
    expect(html).not.toContain("<script");
  });

  it("stamps an id anchor on a top-level block section", async () => {
    const html = await assemble([{ type: "prose", id: "p1", markdown: "x" }], { title: "T", source: "s" });
    expect(html).toContain('id="p1"');
  });

  it("throws on a nested group (groups may not nest)", async () => {
    const blocks: Block[] = [
      { type: "group", id: "g1", title: "A", blocks: [{ type: "group", id: "g2", title: "B", blocks: [] }] },
    ];
    await expect(assemble(blocks, { title: "T", source: "s" })).rejects.toThrow(/nest/);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- assemble.test`
Expected: FAIL — `group` is not an assignable block type / not rendered.

- [ ] **Step 3: Add GroupBlock to the type model**

In `src/blocks.ts`, add the interface (after `QuestionsBlock`):

```ts
export interface GroupBlock {
  type: "group";
  id: string;
  title: string;
  blocks: Block[];   // one level of nesting — children are non-group blocks
}
```

Add `| GroupBlock` to the `Block` union:

```ts
export type Block =
  | DiagramBlock
  | SchemaBlock
  | ApiBlock
  | FileTreeBlock
  | DiffBlock
  | ProseBlock
  | AnnotatedCodeBlock
  | QuestionsBlock
  | GroupBlock;
```

(`isDiagramBlock` is unchanged — a group is not a diagram.)

- [ ] **Step 4: Refactor assemble for recursion + anchors + groups**

Replace the body of `assemble` (from `const diagramBlocks = …` through the `const fragments = …` assignment) in `src/assemble.ts` with:

```ts
  // Collect diagram/schema blocks recursively (they may be nested in groups) and
  // render them to inline SVG up front.
  const collectDiagrams = (bs: Block[]): (import("./blocks.js").DiagramBlock | import("./blocks.js").SchemaBlock)[] => {
    const out: (import("./blocks.js").DiagramBlock | import("./blocks.js").SchemaBlock)[] = [];
    for (const b of bs) {
      if (isDiagramBlock(b)) out.push(b);
      else if (b.type === "group") out.push(...collectDiagrams(b.blocks));
    }
    return out;
  };
  const rendered = await renderAll(collectDiagrams(blocks), {
    outDir: opts.outDir, excalidraw: opts.excalidraw, onWarn: opts.onWarn,
  });
  const svgById = new Map<string, (typeof rendered)[number]>();
  for (const r of rendered) {
    if (svgById.has(r.id)) {
      throw new Error(`duplicate diagram/schema block id "${r.id}" — block ids must be unique`);
    }
    svgById.set(r.id, r);
  }

  // Inject the block id as an in-page anchor on its top-level <section>.
  const withAnchor = (id: string, html: string): string =>
    html.replace('<section class="vs-block', `<section id="${escapeHtml(id)}" class="vs-block`);

  const renderBlock = async (b: Block): Promise<string> => {
    let html: string;
    switch (b.type) {
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
      case "prose": html = await renderProse(b, opts.onWarn); break;
      case "file-tree": html = renderFileTree(b); break;
      case "diff": html = await renderDiff(b, opts.onWarn); break;
      case "api": html = renderApi(b); break;
      case "annotated-code": html = await renderAnnotatedCode(b, opts.onWarn); break;
      case "questions": html = renderQuestions(b); break;
      case "group": {
        for (const child of b.blocks) {
          if (child.type === "group") {
            throw new Error(`group "${b.id}" contains a nested group "${child.id}" — groups may not nest`);
          }
        }
        const children = await Promise.all(b.blocks.map(renderBlock));
        html = `<section class="vs-block vs-group"><h2>${escapeHtml(b.title)}</h2>${children.join("")}</section>`;
        break;
      }
      default: {
        const _exhaustive: never = b;
        throw new Error(`unhandled block type: ${(_exhaustive as Block).type}`);
      }
    }
    return withAnchor(b.id, html);
  };

  const fragments = await Promise.all(blocks.map(renderBlock));
```

(The rest of `assemble` — `css`, `status`, `header`, the final HTML return — is unchanged.)

- [ ] **Step 5: CSS**

Append to `assets/template.css`:

```css
.vs-group { background:#faf9f6; }
.vs-group > h2 { margin-top:0; }
.vs-group .vs-block { box-shadow:none; }
```

- [ ] **Step 6: Document `group` in the plan skill (keeps the block-coverage guard green)**

In `skills/visual-plan/SKILL.md`, in the block-type list, add a bullet so the literal `` `group` `` appears (the guard test requires every Block type be documented there):

```markdown
- **grouping → `group`** — `{ "type":"group", "id":"…", "title":"…", "blocks":[ … ] }` wraps
  blocks into a titled section (one level deep). Used mainly by recaps to order diffs into a
  narrative; available for plans too.
```

- [ ] **Step 7: Run full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass (incl. the new assemble tests and the skill-docs block-coverage guard, now satisfied by the `group` mention); no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/blocks.ts src/assemble.ts assets/template.css skills/visual-plan/SKILL.md test/assemble.test.ts
git commit -m "$(cat <<'EOF'
feat: GroupBlock + recursive assemble with section id anchors

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Title the mechanical summary "Summary"

**Files:**
- Modify: `src/gather-recap.ts`
- Test: `test/gather-recap.test.ts`

- [ ] **Step 1: Add the failing assertion**

In `test/gather-recap.test.ts`, in the first test ("produces a rich summary, file-tree, and diff blocks (generic stack)"), add after the existing summary assertion:

```ts
    expect((summary as { title?: string }).title).toBe("Summary");
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- gather-recap`
Expected: FAIL — the summary block currently has no `title`.

- [ ] **Step 3: Implement**

In `src/gather-recap.ts`, change the summary `unshift` to include the title:

```ts
  blocks.unshift({
    type: "prose",
    id: "summary",
    title: "Summary",
    markdown: summaryMarkdown(scope, files, procedures, schemaBlock != null),
  });
```

- [ ] **Step 4: Run + full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/gather-recap.ts test/gather-recap.test.ts
git commit -m "$(cat <<'EOF'
feat: title the mechanical recap summary "Summary"

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: visual-recap skill — the review-narrative rewrite

**Files:**
- Modify: `skills/visual-recap/SKILL.md`
- Test: `test/skill-docs.test.ts`

- [ ] **Step 1: Extend the guard test first**

In `test/skill-docs.test.ts`, the existing test "visual-recap documents the behavioral diagram selection guide" asserts `sequence`/`state`/`--emit-blocks`. Add a new test inside the same `describe`:

```ts
  it("visual-recap documents the review-narrative enrichment", () => {
    expect(recapSkill).toContain("Summary");
    expect(recapSkill).toContain("description");
    expect(recapSkill).toContain("group");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- skill-docs`
Expected: FAIL — the current visual-recap SKILL.md lacks the new enrichment guidance.

- [ ] **Step 3: Replace the enrichment section**

In `skills/visual-recap/SKILL.md`, replace the entire `## Add context (smart enrichment)` section (from that heading through the end of the "Authoring recipes" subsection — i.e. to end of file) with:

````markdown
## Add context (make it a review narrative)

The bare recap is mechanical. To turn it into a presentation of the change, enrich it:

1. Emit the gathered blocks instead of HTML:

       cd "$VISUAL_SKILLS_DIR"
       npx tsx bin/recap.ts --repo <ABSOLUTE_TARGET_REPO> <target flag> --emit-blocks <ABSOLUTE_BLOCKS_JSON>

2. **Read the diff AND the changed code.** Open the changed files in the target repo to
   understand *what the change does and why* — don't work from the diff text alone.

3. **Rewrite the `summary` block** (keep `"id": "summary"`, `"title": "Summary"`). Its
   `markdown` should explain the change in prose: what it does, why, and the user-facing
   effect — not file/line counts.

4. **Annotate each diff.** Set each diff block's `description` (markdown) to *what changes in
   this file and why*. Cross-link related diffs by their block id, which you can see in the
   emitted JSON, e.g. `See [the router](#diff-3).` (each block renders with `id="<its id>"`,
   so `#diff-3` jumps to that diff).

5. **Order and group the diffs.** Wrap the diff blocks in `group` blocks, ordered by
   importance, so reading top-to-bottom is a narrative — e.g. *The core change* →
   *Supporting wiring* → *Tests & config*. A group is
   `{ "type":"group", "id":"…", "title":"…", "blocks":[ …diff blocks… ] }` (one level deep —
   groups may not contain groups). Place the groups after the Summary, the `where-it-fits`
   diagram, and the behavioral diagram.

6. **Author ONE behavioral diagram** for the change (see the selection guide) and place it
   near the top (after the Summary / where-it-fits).

7. Render the combined array and open it:

       npx tsx bin/plan.ts --blocks <ABSOLUTE_BLOCKS_JSON> --title "Recap — <label>" --out <ABSOLUTE_OUT_DIR>
       open <ABSOLUTE_OUT_DIR>/plan.html

### Which behavioral diagram to pick

- **Sequence diagram** (`"kind": "sequence"`) — when the change adds or alters a
  multi-collaborator runtime path: a new request/response flow, an external integration call
  chain. Collaborators on lifelines, time downward, ONE scenario.
- **State machine** (`"kind": "architecture"`) — when the change alters a bounded lifecycle:
  statuses, subscription / checkout / signup stages — an entity in one of N states with
  labeled transitions.
- If the change is purely structural, the `where-it-fits` graph already covers it — skip the
  behavioral diagram rather than force one.

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
feat: visual-recap review-narrative enrichment (summary, per-diff why, groups)

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

- [ ] **Step 2: ppgl recap regression (bare CLI now titles the summary)**

```bash
cd ~/Projects/visual-skills
rm -rf /tmp/m7r
npx tsx bin/recap.ts --repo ~/Projects/ppgl --commit 3559f61 --out /tmp/m7r 2>/tmp/m7r.err
echo "exit=$?"; cat /tmp/m7r.err
echo "--- <script (expect 0) ---"; grep -c "<script" /tmp/m7r/recap.html
echo "--- <h2>Summary</h2> (expect >=1) ---"; grep -c "<h2>Summary</h2>" /tmp/m7r/recap.html
echo "--- section anchors present (expect >=1) ---"; grep -c 'id="summary"' /tmp/m7r/recap.html
echo "--- placeholder leaks (expect 0) ---"; grep -c "failed to render" /tmp/m7r/recap.html
```

Expected: exit 0; no warnings; 0 `<script>`; the summary heading present; `id="summary"` anchor present; 0 placeholders.

- [ ] **Step 3: Authored review-narrative render (groups + diff descriptions + cross-links)**

Exercise the full M7 block set through `plan` to prove the renderer end-to-end:

```bash
cd ~/Projects/visual-skills
cat > /tmp/m7-blocks.json <<'EOF'
[
  { "type": "prose", "id": "summary", "title": "Summary", "markdown": "Replaces Stripe with PayPal. See [the core change](#diff-0)." },
  { "type": "group", "id": "core", "title": "The core change", "blocks": [
    { "type": "diff", "id": "diff-0", "title": "paypal.ts", "path": "src/lib/paypal.ts",
      "description": "New PayPal client. Wired into [the router](#diff-1).",
      "hunks": [{ "header": "@@ -0,0 +1 @@", "lines": ["+export const paypal = {};"] }] }
  ] },
  { "type": "group", "id": "wiring", "title": "Supporting wiring", "blocks": [
    { "type": "diff", "id": "diff-1", "title": "router.ts", "path": "src/server/router.ts",
      "description": "Calls the new [paypal client](#diff-0).",
      "hunks": [{ "header": "@@ -1 +1 @@", "lines": ["+import { paypal } from '../lib/paypal.js';"] }] }
  ] }
]
EOF
npx tsx bin/plan.ts --blocks /tmp/m7-blocks.json --title "Narrative" --out /tmp/m7p 2>/tmp/m7p.err
echo "exit=$?"; cat /tmp/m7p.err
echo "--- groups (expect 2) ---"; grep -c 'class="vs-block vs-group"' /tmp/m7p/plan.html
echo "--- diff descriptions (expect 2) ---"; grep -c 'class="vs-diff-desc"' /tmp/m7p/plan.html
echo "--- cross-link anchors resolve: id=\"diff-0\" + href=\"#diff-0\" present ---"; grep -c 'id="diff-0"' /tmp/m7p/plan.html; grep -c 'href="#diff-0"' /tmp/m7p/plan.html
echo "--- Summary heading + no script + no placeholder ---"; grep -c "<h2>Summary</h2>" /tmp/m7p/plan.html; grep -c "<script" /tmp/m7p/plan.html; grep -c "failed to render" /tmp/m7p/plan.html
```

Expected: exit 0; 2 groups; 2 `vs-diff-desc` callouts; `id="diff-0"` and `href="#diff-0"` both present (the cross-link target + link); the Summary heading present; 0 `<script>`; 0 "failed to render".

- [ ] **Step 4: Manual review-narrative check (on the user's machine)**

Run by the human partner: in a Claude Code session, ask "make a visual recap of commit <sha>" and confirm the agent reads the code, writes a real Summary, annotates each diff with what/why + cross-links, and orders/groups the diffs into a narrative. Behavioral; verified live.

- [ ] **Step 5: Final commit (only if anything changed)**

If Steps 1–3 surfaced a fix, commit it with the co-author trailer. Otherwise the automated portion of M7 is complete; the manual narrative check (Step 4) remains for the user.

---

## Notes for the Implementer

- **Tasks 1 and 2 both touch `prose.ts`** in sequence — Task 2 builds on Task 1's refactored version. Apply them in order.
- **Anchors via `withAnchor`** rely on every renderer emitting `<section class="vs-block …">` — all six do, plus the diagram/group inline cases. The single string-replace injects the id into the block's own outer section (the first occurrence); group children already carry their own ids from their own `renderBlock` pass.
- **`group` nesting is one level** — `assemble` throws on a group-in-group; the skill instructs the agent never to nest. The exhaustiveness `never` switch must include the `group` case.
- **Graceful degradation** holds: absent `description`/`title` → no callout/heading; a dead `#id` cross-link is harmless; a bad diagram → placeholder.
- **Run single tests** during a task; run the full suite in Tasks 4, 5, 6, and 7.
