# Lead Summary (`overview` block) — Design

**Date:** 2026-06-18
**Status:** Approved (brainstorming)

## Goal

Give larger recaps and specs a scannable, change-first lead that grounds a reader in seconds:
a one-line headline, a short list of key points that each link down to their detailed section,
and a lead diagram placed *before* the prose. Optimized for a time-crunch read — the biggest
points up top, details below.

This is the first of two specs from one idea; **semantic color in diagrams** is a separate,
cross-cutting spec to follow.

## Background

- The recap's summary is today a `prose` block (id `summary`, title "Summary") — freeform
  markdown the agent rewrites during enrichment (M7). Nothing enforces scannability.
- Per-block `#id` anchors + in-page cross-links already work (M7); markdown links to `#id`
  resolve. So "link to the detail sections" is a matter of structure + guidance, not new plumbing.
- A diagram can already be embedded in a block and rendered up front (the per-diff pattern):
  `collectDiagrams`/`assertUniqueIds` recurse into an embedded `DiagramBlock | TabsBlock`, the
  assembler pre-renders it, and editability/sidecars come for free.
- `renderMarkdown` (`src/renderers/markdown.ts`) returns sanitized *block* HTML (with `<p>`
  wrappers). The overview's headline and points need *inline* rendering (no paragraph wrapper).

## Decisions (locked during brainstorming)

1. **First-class `overview` block** (not prose + guidance) — the renderer enforces the scannable
   shape so a wall of text is structurally impossible.
2. **Embedded lead diagram** on the block (reusing the per-diff `DiagramBlock | TabsBlock` pattern).
3. **Card order: headline → diagram → points** — diagram before prose.
4. **Points are structured** `{ text, href? }` — `href` makes section-linking first-class.
5. **Hybrid split unchanged** — the bare CLI keeps the mechanical prose summary; the agent
   authors the `overview` during enrichment (it needs understanding to pick headline/points/links/
   lead diagram).
6. **No hard size threshold in code** — guidance decides when to use it (large PRs/specs); small
   changes keep the plain prose summary.

## Component 1 — `renderInlineMarkdown` helper

Add to `src/renderers/markdown.ts` a sibling of `renderMarkdown` for short inline strings
(headline, point text) — inline rendering so there's no `<p>` wrapper, same sanitize policy:

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

(No Shiki/`walkTokens` needed — inline code is a `codespan`, not a fenced block. `SANITIZE_OPTS`
is the existing module constant; export nothing new from it.)

## Component 2 — `OverviewBlock` type, renderer, assemble wiring, CSS

### Type (`src/blocks.ts`)

```ts
export interface OverviewBlock {
  type: "overview";
  id: string;
  headline: string;                            // the main change, one scannable line (inline markdown)
  points: { text: string; href?: string }[];   // short key points; href = "#section-id" to its detail
  diagram?: DiagramBlock | TabsBlock;           // lead illustration, rendered before the points
}
```

Add `| OverviewBlock` to the `Block` union. `isDiagramBlock` is unchanged.

### Renderer (`src/renderers/overview.ts`, new)

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

(`diagramHtml` is pre-rendered trusted assembler output, inserted as-is — same contract as
`renderDiff`'s `diagramHtml`. The renderer compiles no d2.)

### Assemble wiring (`src/assemble.ts`)

- `assertUniqueIds`: add `else if (b.type === "overview" && b.diagram) assertUniqueIds([b.diagram], seen);`
- `collectDiagrams`: add `else if (b.type === "overview" && b.diagram) out.push(...collectDiagrams([b.diagram]));`
- `renderBlock`: add a `case "overview"` mirroring `case "diff"`'s embed logic:

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

  (`diagramInner` is the helper extracted in the per-diff work; the exhaustiveness `never`
  default stays valid once `overview` is handled.)

### CSS (`assets/template.css`)

Add `.vs-overview` styled as a prominent callout (distinct background + left accent border),
`.vs-overview-headline` (large, tight), `.vs-overview-diagram` (the lead illustration), and
`.vs-overview-points` (tight bulleted list, comfortable line spacing — scannable, no paragraph
indents; `.vs-overview-points li > p { margin: 0 }` if inline rendering ever wraps). When the lead
diagram is a `tabs` set, the tabs renderer emits its own `<h2>` title inside `.vs-overview-diagram`
— demote it to a caption size with `.vs-overview-diagram h2 { font-size: ...; ... }`, mirroring the
per-diff `.vs-diff-diagram` heading rule, so it doesn't compete with the overview headline.

## Component 3 — Skill guidance

- **`skills/visual-recap/SKILL.md`:** in the enrichment steps, replace the "rewrite the summary"
  guidance so that for a larger change the agent emits an `overview` block *first* (in place of the
  `summary` prose block): a one-line `headline` stating the main change; 3–6 short `points`, each
  with `href` to its group/diff/section `#id`; and `diagram` set to the single most illuminating
  illustration (often `where-it-fits` or the key behavioral diagram). For small changes the plain
  prose summary is fine. Show the JSON shape. Note: link `href`s must be real block ids, and don't
  target a diagram hidden in a non-default tab.
- **`skills/visual-plan/SKILL.md`:** add an `overview` bullet to the content→block mapping — lead a
  spec with an `overview` the same way.

## Component 4 — Testing

- **`test/markdown.test.ts`** (or a new `test/overview.test.ts`): `renderInlineMarkdown("uses `foo`
  **bold**")` returns inline HTML containing `<code>foo</code>` and `<strong>bold</strong>` with NO
  `<p>` wrapper; a `<script>`/`javascript:` is stripped.
- **`test/overview.test.ts`:** `renderOverview` emits the headline, the points (a point with a
  `#frag` href becomes an `<a href="#frag">`; a point with a `javascript:` href renders as plain
  text, NOT a link; a point with no href renders plain), and places `diagramHtml` between the
  headline and the points.
- **`test/assemble.test.ts`:** an `overview` with an embedded single diagram renders the diagram's
  real `<svg>` inside the `vs-overview` section; `collectDiagrams` recurses into `overview.diagram`
  (broken-d2 emits an `onWarn`); `assertUniqueIds` throws on a duplicate embedded diagram id; a
  point `href="#diff-0"` renders as a resolvable link when a `diff-0` block exists.
- **`test/skill-docs.test.ts`:** `overview` appears in the block-coverage guard (visual-plan must
  document `` `overview` ``); visual-recap documents the overview (e.g. contains `"overview"`).

## Out of scope

- Semantic color in diagrams (the next spec).
- A code-enforced size threshold for when to use `overview` (guidance decides).
- Auto-generating the `overview` in the bare CLI (it stays mechanical prose).
- Nesting beyond overview → tabs → diagram (a tab still holds one non-container block).

## Implementation sequencing (small commits)

1. `renderInlineMarkdown` helper + its test.
2. `OverviewBlock` type + `renderOverview` + assemble `case "overview"` + recursion + CSS + tests.
3. Skill guidance (visual-recap + visual-plan) + skill-docs test.
