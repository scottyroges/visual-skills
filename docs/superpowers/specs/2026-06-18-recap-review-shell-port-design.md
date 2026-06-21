# Recap "Review Shell" Port — Design

**Date:** 2026-06-18
**Status:** Approved (brainstorming complete)
**Canonical visual reference:** `~/Projects/ppgl/.recaps/pr-180-redesign/variant-c-color.html`
(the agreed "variant C, with touches" mockup — the single source of truth for the design system).

## Problem & Goal

We designed and iterated a clean, app-shell "PR review" document (variant C). It surfaces the
essence fast (TL;DR + risk), then walks the reviewer through the change as a guided narrative with
full, line-numbered diffs — a genuine replacement for reading the PR. Today the recap renderer emits
a simple stacked single-column document that looks nothing like it.

**Goal:** port the variant-C design into the **recap** output so every `visual-recap` invocation
ships that result, faithfully — missing none of the edits made during the mockup iteration.

## Scope

- **Recap only.** A new review assembler renders recap output in the C shell.
- **`plan` output is untouched.** `bin/plan.ts` keeps using the existing `src/assemble.ts` and
  `assets/template.css`; no regression to plan documents.
- The shell **degrades gracefully**: sections/sidebar groups render only when their source blocks
  exist (a recap with no diagrams simply omits the diagrams section, etc.).

## Architecture

- **New `src/assemble-review.ts`** exporting `assembleReview(blocks, opts): Promise<string>`.
  `bin/recap.ts` calls it instead of `assemble`. `bin/plan.ts` is unchanged.
- **New `assets/review.css`** — the complete variant-C stylesheet (the design system below).
- **New `assets/review-viewer.js`** — the variant-C client JS: sidebar toggle (mobile), scroll-spy
  (outline + progress rail), zoom overlay (open/close/in/out/reset, drag-pan, wheel-zoom), and
  **open-on-hash** (so a file-tree link opens a collapsed diff). Inlined as exactly one `<script>`.
- **Block renderers:** reuse the existing renderers for blocks whose markup is unchanged (`api`,
  `prose`, `questions`, `annotated-code`) — they inherit the review CSS. Provide **review-specific
  rendering** for the three blocks whose structure differs in C: `overview` (TL;DR card),
  `file-tree` (sidebar list + files table), and `diff` (line-numbered collapsible diff). These live
  in `assemble-review.ts` and/or new `src/renderers/review-*.ts` helpers; the existing
  `src/renderers/*` used by plan stay intact.
- **Auto-derived chrome:** `assembleReview` computes the topbar and sidebar from the blocks — no new
  authoring required (see below).

## Block-model change (`src/blocks.ts`)

Extend `OverviewBlock` with optional, backward-compatible fields:

```ts
export interface OverviewBlock {
  type: "overview";
  id: string;
  headline: string;
  points: { text: string; href?: string }[];
  diagram?: DiagramBlock | TabsBlock;
  // NEW (all optional — older blocks.json still render):
  facets?: { what?: string; why?: string; size?: string };   // the TL;DR What/Why/Size rows
  risk?: { level: "low" | "med" | "high"; note?: string };    // drives the topbar + card risk chip
  startHref?: string;                                          // "Start here →" target (#id)
}
```

## App-shell structure (auto-derived chrome)

`assembleReview` emits:

```
<header class="topbar"> … </header>
<div class="sidebar-overlay"></div>      (mobile)
<div class="layout">
  <nav class="sidebar"> … </nav>
  <main class="main"> … sections … </main>
</div>
<div id="zoom-overlay" …> … </div>       (zoom viewer)
<script> … review-viewer.js … </script>
```

- **Topbar** (derived): document title · **risk chip** (from `overview.risk.level`, color-coded
  LOW green / MED amber / HIGH red) · `+x/−y` stat & `N files` (summed from the file-tree block) ·
  scope tag (e.g. "PR 1 of 3" if available, else the scope label) · source meta (`opts.source`).
- **Sidebar** (derived), three sections:
  1. **Files changed** — list from the file-tree block: status marker (A/M/D), filename (truncating,
     links to its `#diff-id`), `+/−` stat.
  2. **Walkthrough** — outline: top-level overview/sections + numbered chapters (groups → 1/2/3) and
     subsections (diffs in a group → 1a/1b/1c), each a clickable anchor with **scroll-spy** active
     state.
  3. **Meta** — stack/adapter + `base <sha> → head <sha>` (full short SHAs, `overflow-wrap:anywhere`).

## Section mapping (main column)

| Block | Renders as |
|---|---|
| `overview` | **TL;DR card** (eyebrow + headline + What/Why/Risk/Size rows + Start-here link + key-fact points) and feeds the **topbar risk chip** |
| `file-tree` | **Files changed table** (clickable paths → `#diff-id`, status markers, stats, role column) |
| `api` | **API surface** block (existing renderer) |
| `diagram` / `tabs` | **Diagram card** (clean d2 + legend, click-to-enlarge zoom/pan) |
| `group` | **Chapter** — accent number pill (① ② ③) on the chapter title |
| `diff` (within a group) | **Subsection** — neutral fitted marker pill (1a/1b/1c) + title + path + stat + markdown description + **full, line-numbered, collapsible diff** |
| `prose`, `questions`, `annotated-code` | existing renderers, styled by review CSS |

Chapter and subsection numbers are computed by `assembleReview` from block order (group index →
chapter number; diff index within a group → letter).

## Diff rendering (line numbers + full diff)

- Render each diff as the C **file-diff**: a one-line summary (single chevron, native marker hidden,
  `path · badge · ……… · +x/−y · ›`) over a `<details>` (collapsed by default) containing the diff.
- The diff body is a `.diff-pre` of flex rows: **two line-number columns** (old / new, computed by
  parsing the `@@ -a,b +c,d @@` headers), a `+/−/ ` gutter, and the code cell (`white-space:pre`,
  horizontal scroll). Add / remove / context / hunk-header line styles.
- **No truncation, no "view in the PR."** The full diff for every file must be present. The review
  diff renderer must NOT introduce any per-file line cap or "more lines" note.
- **Full-diff capture (verified — guard only):** the gather already captures complete diffs
  (`git diff base...head` with a 64MB buffer; `parse-diff` has no cap) — verified a +446 file
  gathers all 446 lines. The earlier 16-line observation was a stale artifact. **No fix needed; add
  a regression test** that locks in full-diff capture end-to-end (gather → assembleReview → the
  rendered diff contains the file's last changed line, with no truncation note).

## Diagrams (clean)

- `src/render-diagram.ts`: drop the `--sketch` flag so d2 renders clean to match C. Keep theme/pad,
  the semantic-color prelude, the legend, and the Excalidraw opt-in (its rough look won't match, but
  editability is preserved when enabled). Wrap in the C diagram card with the enlarge button + zoom.

## Design-system inventory (port faithfully — the "don't miss any edits" list)

`variant-c-color.html` is canonical. The review CSS/JS must reproduce all of:

**Tokens:** ink `#1c2024`, ink-muted `#5a626c`, **ink-faint `#646b75`** (AA-corrected from `#8b939e`),
panel `#f7f8fa`, panel-deep, border `#e3e6ea`, border-strong `#c8cdd5`, accent `#2563eb`,
accent-subtle, risk-low `#16a34a` (+bg/border) and **risk-med (amber) / risk-high (red)** systems,
add/remove/change semantic colors (+bg/border), mono + sans font stacks, **fixed rem** type scale,
radius. Z-index scale for overlays.

**Layout:** sticky topbar; fixed left **sidebar** (collapsible under 900px via toggle + overlay,
closes on nav-click); **main** that grows with the window (`max-width:1480px`, ~56px side padding);
prose blocks **un-capped** so they fill the column (no early wrapping); files-table/diffs/diagrams
fill the full width.

**TL;DR card:** `tldr-eyebrow` in **accent**; headline; What/Why/Risk/Size rows; risk chip; Start-here
accent link.

**Walkthrough:** clickable **progress rail** (anchors → `#ch`, scroll-spy active); **chapter title
number pills in accent** (① ② ③); **subsection marker pills** neutral, **fitted as rounded pills**
(so "1a"/"1b"/"1c" fit, single digits stay round); subsection title + path + stat + description.

**Separation hierarchy:** **chapter** breaks = stronger/darker `2px #8b939e` top divider; **within a
chapter** = lighter `1px var(--border)` dividers between subsections and between docs file-groups.

**File-diff:** summary row with **one** chevron (native `::-webkit-details-marker`/`::marker` hidden),
flex row with `margin-left:auto` counts, hover bg + **accent-border hover lift (soft shadow)**, focus
ring; `.diff-pre` flex rows with old/new line-number columns (`.dn`), gutter (`.dg`), code (`.dc`);
add/del/ctx/hunk line styling; line-number color `#8b939e`.

**Typography:** `text-wrap: balance` on headings, `text-wrap: pretty` on prose.

**Motion:** `scroll-behavior: smooth`; 100–150ms ease-out transitions; **full
`prefers-reduced-motion` reset** (kills transitions/animations and smooth scroll).

**Color touches (the "with touches" version):** accent chapter pills; accent TL;DR eyebrow;
file-row hover lift; risk LOW/MED/HIGH chip system.

**Client JS (`review-viewer.js`):** sidebar toggle + overlay + close-on-nav; scroll-spy for the
outline and progress rail (active by chapter index); zoom overlay (open on diagram/enlarge click,
controls in/out/reset/close, drag-pan with `pointercancel` reset, wheel-zoom, Esc/backdrop close);
open-on-hash (open ancestor `<details>` of a hash target, and a linked diff's own `<details>`).

## Skill guidance

Update `skills/visual-recap/SKILL.md`: instruct the agent to author the new `overview` TL;DR fields
(`facets.what/why/size`, `risk.level/note`, `startHref`) so the TL;DR card + topbar risk chip
populate. Keep all existing guidance (ordering, scannable/optional descriptions, group descriptions,
keyword links, legend).

## Testing

- `assembleReview` emits `topbar` + `sidebar` + `main` and **exactly one** inlined viewer
  `<script>` (no external `src`); sanitization of user content stays strict.
- TL;DR card renders facets + risk; **topbar risk chip color-codes by level** (low/med/high).
- Sidebar **files list** + **outline** are derived from the file-tree + groups; outline numbering
  (1 / 1a / 1b / 2 / 3) is correct.
- Diff renders **old/new line-number columns** and the full diff (assert a known late line is
  present; assert **no** "more lines"/"view the PR" text).
- **Full-diff gather**: a large added file yields its complete line count (regression test for the
  truncation fix).
- Diagrams render **without `sketch`** (clean d2); legend still present for colored diagrams.
- `--ink-faint` passes AA (≥4.5:1 on white and panel).
- **`plan` output is unchanged** (existing plan tests still pass; `assemble.ts`/`template.css`
  untouched).

## Phasing (one spec, committed per phase)

1. **Shell + design system** — `assembleReview` skeleton (topbar/sidebar/main), `assets/review.css`
   (full token + layout + component system), `assets/review-viewer.js`, wired into `recap.ts`.
2. **Block→section mapping** — overview/TL;DR card (+ block-model fields), files-changed table,
   API, diagram card, walkthrough chapters/subsections with numbering + tiered dividers.
3. **Sidebar/topbar derivation** — files list, outline + scroll-spy + clickable anchors, meta,
   risk chip + stats.
4. **Diff line-numbers + full-diff gather fix.**
5. **Diagrams (clean d2) + color touches + contrast/typography/motion polish.**
6. **Skill guidance** + final holistic review.

## Out of scope (YAGNI)

- Changing `plan` output (explicitly recap-only).
- A theme toggle / dark mode.
- Re-authoring real diagrams (agents still author d2/mermaid via the catalog; we only restyle).
- Replacing the Excalidraw pipeline (kept opt-in, unchanged).
