# Lead Summary (`overview` block) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class `overview` block — a scannable lead (headline → diagram → linked key points) the agent places at the top of larger recaps/specs.

**Architecture:** A new `OverviewBlock` renders as a callout in headline → lead-diagram → points order. The lead diagram reuses the per-diff embed machinery (`collectDiagrams`/`assertUniqueIds` recurse into `b.diagram`; the assembler pre-renders it and passes HTML to the renderer). Headline/points use a new inline-markdown helper so they can't become walls of text. The bare CLI keeps the mechanical prose summary; the agent authors the `overview` during enrichment.

**Tech Stack:** TypeScript (NodeNext ESM, `.js` import specifiers), vitest, marked + sanitize-html, the `d2` binary, the per-diff embed pattern + `TabsBlock`.

---

## File Structure

- `src/renderers/markdown.ts` — **modify.** Add `renderInlineMarkdown` (inline, no `<p>` wrapper).
- `src/blocks.ts` — **modify.** Add `OverviewBlock` + union member.
- `src/renderers/overview.ts` — **create.** `renderOverview(block, diagramHtml?)`.
- `src/assemble.ts` — **modify.** Import `renderOverview`; recurse into `overview.diagram`; add `case "overview"`.
- `assets/template.css` — **modify.** `.vs-overview` callout styles.
- `skills/visual-plan/SKILL.md` — **modify (Task 2).** `overview` block-mapping bullet (keeps block-coverage test green).
- `skills/visual-recap/SKILL.md` — **modify (Task 3).** Lead-with-overview enrichment guidance.
- `test/markdown.test.ts`, `test/overview.test.ts`, `test/assemble.test.ts`, `test/skill-docs.test.ts` — tests.

---

## Task 1: `renderInlineMarkdown` helper

**Files:**
- Modify: `src/renderers/markdown.ts`
- Test: `test/markdown.test.ts`

- [ ] **Step 1: Write the failing tests**

In `test/markdown.test.ts`, add `renderInlineMarkdown` to the existing import from
`../src/renderers/markdown.js` (it currently imports `renderMarkdown`), then append:

```ts
describe("renderInlineMarkdown", () => {
  it("renders inline markdown without a <p> wrapper", async () => {
    const html = await renderInlineMarkdown("uses `foo` and **bold**");
    expect(html).toContain("<code>foo</code>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).not.toContain("<p>");
  });

  it("keeps a safe #fragment link", async () => {
    const html = await renderInlineMarkdown("see [the diff](#diff-0)");
    expect(html).toContain('href="#diff-0"');
  });

  it("strips scripts and javascript: urls", async () => {
    const html = await renderInlineMarkdown("[x](javascript:alert(1)) <script>bad()</script>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- markdown`
Expected: FAIL — `renderInlineMarkdown` is not exported.

- [ ] **Step 3: Implement `renderInlineMarkdown`**

In `src/renderers/markdown.ts`, append this exported function after `renderMarkdown` (the
`Marked`, `sanitizeHtml`, and `SANITIZE_OPTS` it uses are already in the module):

```ts
/** Render a short Markdown string as sanitized INLINE HTML (no <p> wrapper) — for headlines,
 *  list items, and other one-line strings. inline `code`, **bold**, links, etc. survive;
 *  scripts / handlers / javascript: URLs are stripped (same policy as renderMarkdown). */
export async function renderInlineMarkdown(markdown: string): Promise<string> {
  const md = new Marked({ async: true });
  const body = (await md.parseInline(markdown)) as string;
  return sanitizeHtml(body, SANITIZE_OPTS);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- markdown` then `npm run typecheck`
Expected: PASS (all markdown tests, incl. the 3 new ones); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderers/markdown.ts test/markdown.test.ts
git commit -m "feat: renderInlineMarkdown — sanitized inline markdown helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `OverviewBlock` type, renderer, assemble wiring, CSS

**Files:**
- Modify: `src/blocks.ts`
- Create: `src/renderers/overview.ts`
- Modify: `src/assemble.ts`
- Modify: `assets/template.css`
- Modify: `skills/visual-plan/SKILL.md` (the `overview` mapping bullet — keeps the block-coverage test green)
- Test: `test/overview.test.ts` (new), `test/assemble.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/overview.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderOverview } from "../src/renderers/overview.js";
import type { OverviewBlock } from "../src/blocks.js";

const base: OverviewBlock = {
  type: "overview", id: "ov",
  headline: "Add **PayPal** capture",
  points: [
    { text: "new `capture` route", href: "#diff-0" },
    { text: "no link here" },
    { text: "bad link", href: "javascript:alert(1)" },
  ],
};

describe("renderOverview", () => {
  it("renders the headline as inline markdown (no <p>)", async () => {
    const html = await renderOverview(base);
    expect(html).toContain('class="vs-overview-headline"');
    expect(html).toContain("<strong>PayPal</strong>");
    expect(html).not.toContain("<p>");
  });

  it("links a point with a safe #fragment href, renders inline code, leaves no-href plain", async () => {
    const html = await renderOverview(base);
    expect(html).toContain('<a href="#diff-0">');
    expect(html).toContain("<code>capture</code>");
    expect(html).toContain("<li>no link here</li>");
  });

  it("does NOT linkify an unsafe javascript: href (renders plain text)", async () => {
    const html = await renderOverview(base);
    expect(html).not.toContain("javascript:");
    expect(html).toContain("<li>bad link</li>");
  });

  it("places the diagram fragment between the headline and the points", async () => {
    const html = await renderOverview(base, "<div class='vs-overview-diagram'>DIAG</div>");
    const headIdx = html.indexOf("vs-overview-headline");
    const diagIdx = html.indexOf("vs-overview-diagram");
    const pointsIdx = html.indexOf("vs-overview-points");
    expect(headIdx).toBeGreaterThanOrEqual(0);
    expect(diagIdx).toBeGreaterThan(headIdx);
    expect(pointsIdx).toBeGreaterThan(diagIdx);
  });
});
```

Then append to `test/assemble.test.ts`:

```ts
describe("assemble — overview block", () => {
  it("renders an overview with an embedded diagram and a resolvable point link", async () => {
    const blocks: Block[] = [
      { type: "overview", id: "ov", headline: "Lead", points: [{ text: "see the diff", href: "#diff-0" }],
        diagram: { type: "diagram", id: "ov-diag", title: "Flow", kind: "flowchart", d2: "a -> b" } },
      { type: "diff", id: "diff-0", title: "x.ts", path: "src/x.ts", hunks: [{ header: "@@", lines: ["+a"] }] },
    ];
    const html = await assemble(blocks, { title: "T", source: "s" });
    const start = html.indexOf('class="vs-block vs-overview"');
    const end = html.indexOf("</section>", start);
    const section = html.slice(start, end);
    expect(section).toContain("vs-overview-diagram");
    expect(section).toContain("<svg");
    expect(html).toContain('<a href="#diff-0">');
    expect(html).toContain('id="diff-0"'); // the link target exists
  });

  it("collects an overview's embedded diagram into the up-front pass (broken d2 warns)", async () => {
    const warnings: string[] = [];
    const blocks: Block[] = [
      { type: "overview", id: "ov", headline: "Lead", points: [],
        diagram: { type: "diagram", id: "ov-bad", title: "B", kind: "flowchart", d2: "x: {" } },
    ];
    await assemble(blocks, { title: "T", source: "s", onWarn: (m) => warnings.push(m) });
    expect(warnings.some((w) => w.includes("ov-bad"))).toBe(true);
  }, 30_000);

  it("throws when an overview's embedded diagram id duplicates another block id", async () => {
    const blocks: Block[] = [
      { type: "prose", id: "dup", markdown: "x" },
      { type: "overview", id: "ov", headline: "Lead", points: [],
        diagram: { type: "diagram", id: "dup", title: "B", kind: "flowchart", d2: "a -> b" } },
    ];
    await expect(assemble(blocks, { title: "T", source: "s" })).rejects.toThrow(/duplicate block id "dup"/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- overview` and `npm test -- assemble`
Expected: FAIL — `renderOverview` / `OverviewBlock` don't exist; `assemble` has no `case "overview"`.

- [ ] **Step 3: Add the `OverviewBlock` type**

In `src/blocks.ts`, add this interface (place it just before the `Block` union):

```ts
export interface OverviewBlock {
  type: "overview";
  id: string;
  headline: string;                            // the main change, one scannable line (inline markdown)
  points: { text: string; href?: string }[];   // short key points; href = "#section-id" to its detail
  diagram?: DiagramBlock | TabsBlock;           // lead illustration, rendered before the points
}
```

Then add `| OverviewBlock` to the `Block` union (append it as the last member).

- [ ] **Step 4: Create the renderer**

Create `src/renderers/overview.ts`:

```ts
import { escapeHtml } from "../html.js";
import { renderInlineMarkdown } from "./markdown.js";
import type { OverviewBlock } from "../blocks.js";

// Only fragment (#id) and absolute http(s) hrefs are linkable — defense-in-depth against a
// javascript:/data: href slipping into a point; anything else renders as plain text.
const SAFE_HREF = /^(#[A-Za-z0-9_-]+|https?:\/\/)/;

export async function renderOverview(
  block: OverviewBlock,
  diagramHtml = "",
): Promise<string> {
  const headline = `<h2 class="vs-overview-headline">${await renderInlineMarkdown(block.headline)}</h2>`;
  const items = await Promise.all(
    block.points.map(async (p) => {
      const inner = await renderInlineMarkdown(p.text);
      const body = p.href && SAFE_HREF.test(p.href)
        ? `<a href="${escapeHtml(p.href)}">${inner}</a>`
        : inner;
      return `<li>${body}</li>`;
    }),
  );
  const points = items.length ? `<ul class="vs-overview-points">${items.join("")}</ul>` : "";
  return `<section class="vs-block vs-overview">${headline}${diagramHtml}${points}</section>`;
}
```

- [ ] **Step 5: Wire it into `assemble`**

In `src/assemble.ts`:

(a) Add the import near the other renderer imports (e.g. after the `renderDiff` import):

```ts
import { renderOverview } from "./renderers/overview.js";
```

(b) In `assertUniqueIds`, add an `overview` branch alongside the existing `diff` branch:

```ts
    else if (b.type === "diff" && b.diagram) assertUniqueIds([b.diagram], seen);
    else if (b.type === "overview" && b.diagram) assertUniqueIds([b.diagram], seen);
```

(c) In `collectDiagrams`, add an `overview` branch alongside the existing `diff` branch:

```ts
      else if (b.type === "diff" && b.diagram) out.push(...collectDiagrams([b.diagram]));
      else if (b.type === "overview" && b.diagram) out.push(...collectDiagrams([b.diagram]));
```

(d) In `renderBlock`'s `switch`, add a `case "overview"` (next to `case "diff"`), mirroring the
diff embed logic — it uses the existing `diagramInner` helper and the recursive `renderBlock`:

```ts
      case "overview": {
        let diagramHtml = "";
        if (b.diagram?.type === "diagram") {
          diagramHtml = `<div class="vs-overview-diagram">${diagramInner(svgById.get(b.diagram.id)!)}</div>`;
        } else if (b.diagram?.type === "tabs") {
          diagramHtml = `<div class="vs-overview-diagram">${await renderBlock(b.diagram)}</div>`;
        }
        html = await renderOverview(b, diagramHtml);
        break;
      }
```

(The `default:` exhaustiveness `never` check stays valid once `overview` is handled.)

- [ ] **Step 6: Add the CSS**

Append to `assets/template.css`:

```css
/* ── overview (lead summary callout) ──────────────────────────────────────── */
.vs-overview { background: #f5f3ff; border-left: 4px solid #7c5cff; border-radius: 8px; padding: 16px 20px; }
.vs-overview-headline { margin: 0 0 12px; font-size: 1.4rem; line-height: 1.25; }
.vs-overview-diagram { margin: 0 0 12px; }
.vs-overview-diagram svg { max-width: 100%; height: auto; }
.vs-overview-diagram h2, .vs-overview-diagram h3 { margin: 0 0 6px; font-size: 0.95rem; font-weight: 600; color: #57534e; }
.vs-overview-points { margin: 0; padding-left: 1.2rem; line-height: 1.7; }
.vs-overview-points li > p { margin: 0; }
```

- [ ] **Step 7: Document `overview` in the visual-plan skill (keeps block-coverage green)**

In `skills/visual-plan/SKILL.md`, add this bullet immediately AFTER the `- **multiple views of one
thing -> \`tabs\`**` bullet and its JSON example (i.e. after the `tabs` example block):

```markdown
- **lead summary -> `overview`** — a scannable callout placed first: a one-line `headline`, short
  `points` (each `href` linking to a section by `#id`), and an optional lead `diagram`
  (`DiagramBlock` or `tabs`) rendered before the points. Author it for larger plans.

      { "type": "overview", "id": "overview", "headline": "Add PayPal capture",
        "points": [ { "text": "new `capture` route", "href": "#flow" } ],
        "diagram": { "type": "diagram", "id": "ov-flow", "title": "Flow", "kind": "flowchart", "d2": "a -> b" } }
```

- [ ] **Step 8: Run all the tests + typecheck**

Run: `npm test -- overview`, `npm test -- assemble`, then the FULL `npm test`, then `npm run typecheck`.
Expected: PASS everywhere. The full suite matters here: adding `type: "overview"` makes the
skill-docs block-coverage test require `` `overview` `` in visual-plan — Step 7 satisfies it.
Also run `git status --short` and confirm no stray `*.excalidraw` files were left in the repo root.

- [ ] **Step 9: Commit**

```bash
git add src/blocks.ts src/renderers/overview.ts src/assemble.ts assets/template.css skills/visual-plan/SKILL.md test/overview.test.ts test/assemble.test.ts
git commit -m "feat: OverviewBlock — scannable lead summary (headline, lead diagram, linked points)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: visual-recap enrichment guidance + skill-docs test

**Files:**
- Modify: `skills/visual-recap/SKILL.md`
- Test: `test/skill-docs.test.ts`

- [ ] **Step 1: Write the failing test**

In `test/skill-docs.test.ts`, add this test inside the existing `describe("skill docs stay in sync", ...)`
block (after the existing `it(...)` cases):

```ts
  it("visual-recap documents leading with an overview block", () => {
    expect(recapSkill).toContain('"type": "overview"');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- skill-docs`
Expected: FAIL — the recap skill does not yet contain the `"type": "overview"` guidance.

- [ ] **Step 3: Replace the recap's "rewrite the summary" step**

In `skills/visual-recap/SKILL.md`, in the "Add context (make it a review narrative)" section,
replace the existing step 3:

```markdown
3. **Rewrite the `summary` block** (keep `"id": "summary"`, `"title": "Summary"`). Its
   `markdown` should explain the change in prose: what it does, why, and the user-facing
   effect — not file/line counts.
```

with:

```markdown
3. **Lead with a summary.** Rewrite the `summary` prose block to explain the change (what it does,
   why, the user-facing effect — not file/line counts). For a *larger* change, go further: replace
   it with an `overview` block placed FIRST — a scannable lead the reader groks in seconds:

       { "type": "overview", "id": "overview",
         "headline": "Add PayPal capture to the checkout flow",
         "points": [
           { "text": "new `capture` mutation on the order router", "href": "#diff-0" },
           { "text": "checkout calls it after buyer approval", "href": "#diff-1" }
         ],
         "diagram": { "type": "diagram", "id": "ov-flow", "title": "Capture flow", "kind": "sequence",
           "d2": "shape: sequence_diagram\nclient -> api: capture\napi -> paypal: capture",
           "mermaid": "sequenceDiagram\n  client->>api: capture\n  api->>paypal: capture" } }

   - `headline`: the main change in ONE line.
   - `points`: 3–6 SHORT items, each `href` linking (`#id`) to its group/diff/section (no long
     paragraphs — this is the time-crunch read).
   - `diagram`: the single most illuminating illustration (often the `where-it-fits` graph or the
     key behavioral diagram) — lead with the picture. Carry its `mermaid` to stay editable; don't
     point a `href` at a diagram hidden in a non-default tab.
   - For a small change, the plain prose `summary` block is enough — skip the overview.
```

- [ ] **Step 4: Run the test + full suite + typecheck**

Run: `npm test -- skill-docs`, then `npm test`, then `npm run typecheck`.
Expected: PASS — the new test passes; the existing review-narrative-enrichment test still passes
(the words "Summary", "description", "group" remain present elsewhere in the section — e.g. step 5's
"Place the groups after the Summary…"); full suite green; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add skills/visual-recap/SKILL.md test/skill-docs.test.ts
git commit -m "docs: visual-recap leads larger recaps with an overview block

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] `npm test` — all green (incl. new markdown/overview/assemble/skill-docs cases).
- [ ] `npm run typecheck` — clean.
- [ ] Manual smoke: author a `blocks.json` with an `overview` (headline + 2 points each `href`-linking
  to a following block + a lead `diagram`) followed by the linked blocks; run
  `npx tsx bin/plan.ts --blocks blocks.json --out /tmp/overview-demo`; open `/tmp/overview-demo/plan.html`
  and confirm: the callout shows headline → diagram → points; the point links jump to their sections;
  no `<script>`; no "failed to render" placeholder.
