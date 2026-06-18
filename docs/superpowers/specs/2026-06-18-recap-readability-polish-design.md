# Recap Readability & Navigation Polish — Design

**Date:** 2026-06-18
**Status:** Approved (brainstorming complete)

## Problem

Real recap output (e.g. `ppgl/.recaps/pr-195`) surfaced nine readability/navigation
problems. They cluster into: hard-to-scan summary, no way to inspect diagrams closely,
a messy file list, unreadable diagram colors, poor ordering, wall-of-text descriptions,
missing group context, no collapsibility, and forced descriptions on trivial changes.

This is a cohesive polish batch over the renderer, CSS, one inlined viewer script, the
semantic palette, and the skill/catalog guidance. The output stays a **single
self-contained HTML file that works when opened locally over `file://`**.

## Constraint change

The project's "no view-time JS" rule is **relaxed**: a small amount of inlined,
self-contained JavaScript is allowed, provided the document remains a single file that
runs correctly from `file://` (no external `src`, no CDN, no network). User-supplied
content (markdown/prose) must still never be able to inject script — that boundary is
unchanged.

## The nine items

### 1. Summary bullets link a keyword, not the whole line
Today `renderOverview` wraps the entire point `text` in `<a>` when `href` is set, so each
bullet is one giant hyperlink. Change: render point `text` as inline markdown and let the
author link a specific word, e.g.
`new \`capture\` mutation on the [order router](#diff-0)`. Keep `href` supported for
back-compat, but when present (and the text has no inline link) render it as a small
trailing arrow link (`→`) rather than wrapping the whole bullet.

### 2. Click-to-expand diagram overlay (zoom/pan)
Diagrams render inline as today. Clicking a diagram opens a **full-screen overlay** holding
a clone of that diagram's SVG, where the reader can **drag to pan** and **scroll/pinch to
zoom**, with a **reset** control and **Esc / backdrop-click to close**. Implemented by the
inlined viewer script; with JS disabled the diagrams still render inline (graceful
degradation).

### 3. File-tree cleanup
- **Clickable filenames:** when a diff block exists for a file's path, its filename links
  to that diff (`<a href="#diff-id">`). Files with no diff stay plain text. `assemble`
  builds a `path → block-id` map (recursing into groups) and passes it to the file-tree
  renderer.
- **Consistent typography:** normalize the mismatched font sizes — one monospace size for
  dirs and files, aligned `+/−` badges, and a hover affordance on linked names.

### 4. Readable diagram colors + legend
- **Dark ink text:** add an explicit dark font color to every palette role in BOTH
  `D2_CLASS_PRELUDE` and `MERMAID_CLASSDEFS`, eliminating unreadable colored-text-on-
  colored-fill (e.g. red text on pink, orange text on yellow).
- **Legend:** auto-render a compact legend (swatch + role name) inside any diagram card
  that actually applies palette roles. Roles are detected by scanning the block's `d2`
  (and `mermaid`, if present) source for role usage, so the legend lists **only the roles
  used** in that diagram.

### 5. Importance ordering within groups
- **Mechanical default:** `gather-recap` ranks diffs by file type so bare, un-enriched
  recaps don't lead with CSS. Rank order: source code → schema/config → styles → tests →
  lockfiles/generated. Ties keep original (git) order — a stable sort.
- **Skill guidance:** the enriching agent orders diffs within each group
  most-important-first.

### 6. Scannable descriptions (skill guidance)
Diff/group descriptions support full markdown already. Update the skill + catalog to
require scannable descriptions — short sub-headings, bullet lists, inline code, and a
small diagram when it helps — instead of a wall of text. Tighten CSS so lists inside a
description render cleanly.

### 7. Group descriptions
Add optional `description?: string` (markdown) to `GroupBlock`, rendered under the group
title/summary.

### 8. Collapsibility via native `<details>`
- **Diffs:** structure becomes
  `section > h2 title > path > description > diagram > <details><summary>View changes
  (+a −d)</summary> hunks </details>`. The hunks are **collapsed by default**; title,
  path, description, and any diagram remain visible so the reader scans summaries and
  expands only the code they care about.
- **Groups:** wrapped in `<details open>` — `<summary>` is the group title, with the
  description and children inside; **open by default**, collapsible.
- **Overview** (the lead summary) stays **always visible** — it is the at-a-glance read;
  collapsing it defeats its purpose.
- **Open-on-hash:** the viewer script opens ancestor `<details>` of a hash target on load
  and `hashchange`, so a file-tree link (#3) lands on visible content even if the target
  diff is collapsed.

### 9. Optional descriptions
Per-file descriptions are optional — the skill instructs the agent to **omit** a
description for trivial one-line changes where it adds nothing. (No schema change; the
field is already optional. This is guidance + ensuring the renderer looks right with no
description, which it already does.)

## Architecture / files

New:
- `assets/viewer.js` — inlined viewer script: (a) zoom overlay, (b) open-on-hash. Read at
  assemble time and inlined in one `<script>` (mirrors how `template.css` is read +
  inlined).
- `src/renderers/legend.ts` — renders a compact legend from a set of `ColorRole`s.

Modified:
- `src/blocks.ts` — `GroupBlock.description?: string`.
- `src/diagram-colors.ts` — add dark font color to `PALETTE`/`D2_CLASS_PRELUDE`/
  `MERMAID_CLASSDEFS`; export the swatch info legend needs; add a `rolesInSource(src)`
  helper that detects which roles a diagram source applies.
- `src/assemble.ts` — build `path → id` map; pass to file-tree; wrap each rendered diagram
  in a zoomable container; inject the inlined viewer `<script>`; render group description;
  group `<details open>` wrapper; attach legend to colored diagrams.
- `src/renderers/diff.ts` — collapsible hunks via `<details>` (collapsed), description +
  diagram above the `<details>`.
- `src/renderers/file-tree.ts` — clickable filenames via the path→id map; typography.
- `src/renderers/overview.ts` — stop wrapping the whole bullet; inline-markdown text +
  trailing `→` link for `href`.
- `src/gather-recap.ts` — stable importance sort of diff blocks.
- `assets/template.css` — overlay, `details/summary`, file-tree typography, legend,
  description lists, palette text contrast.
- `skills/visual-recap/SKILL.md`, `skills/visual-plan/SKILL.md`,
  `skills/shared/diagrams.md` — guidance for ordering, scannable + optional descriptions,
  inline keyword links, group descriptions, legend.

## Testing

- **Relax** the three document-level `not.toContain("<script")` assertions
  (`assemble.test.ts`, `plan-cli.test.ts`, `recap-emit-blocks.test.ts`) to: the document
  contains exactly one inlined viewer `<script>`, with **no `src=`/external load**.
- **Keep strict** the content-sanitization tests (`markdown.test.ts`, `prose.test.ts`) —
  user content still cannot inject script.
- New/updated tests:
  - diff renders `<details>` with hunks collapsed by default; description + diagram sit
    above the `<details>`.
  - group renders `<details open>` and its `description`.
  - file-tree filename links to the matching diff id; unmatched files stay plain.
  - palette includes a dark font color in both d2 and mermaid representations.
  - legend appears only when a diagram applies ≥1 role, and lists only used roles.
  - `gather-recap` orders diffs by importance rank (source before styles/tests/lockfiles),
    stable within a rank.
  - overview point links only the keyword (no full-bullet `<a>` wrap); trailing `→` link
    when `href` given without an inline link.
  - viewer script is present and inlined (no `src`).

## Execution

One spec, four implementation phases (committed per phase):
1. **Viewer + collapse** — `assets/viewer.js`, inlining, diff/group `<details>`,
   open-on-hash, relax script-assertions.
2. **File tree + ordering** — path→id links, typography, mechanical diff sort.
3. **Colors + legend** — palette font color, `rolesInSource`, `legend.ts`, wiring.
4. **Summary + group desc + guidance** — overview keyword links, group `description`,
   skill/catalog guidance.

## Out of scope (YAGNI)

- Diagram overlay export/download buttons.
- Per-block collapse on every block type (only diffs + groups; overview stays open).
- A standalone `legend` block type (legend is auto-derived from diagram sources).
- Group descriptions carrying their own diagram (a group can already lead with a diagram
  child block).
