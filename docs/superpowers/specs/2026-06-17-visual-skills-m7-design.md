# Visual Skills M7 — Review-Narrative Recaps Design

**Date:** 2026-06-17
**Status:** Approved
**Builds on:** M0–M4, M6 (contextual recaps)

## Goal

Make a recap read like a mini-presentation of the change: a real **Summary** that reads the
code and explains what changed and why; each file diff annotated with what's changing and
why, cross-linked to related diffs; and the diffs ordered by importance and grouped, so
reviewing top-to-bottom tells a coherent story. The intelligence lives in the `visual-recap`
skill (the agent); the bare `recap` CLI stays mechanical as a labelled fallback. A few small
tool enablers make the agent's output renderable.

## Decisions

1. **Intelligence in the skill (agent), not the CLI.** The bare `recap` CLI cannot read or
   understand code; it stays mechanical. The smart recap is produced by invoking the
   `visual-recap` skill, which reads the diff + code and authors the Summary, per-diff
   descriptions, cross-links, and ordering/grouping — then renders via `plan`. No API keys
   or new infra (extends the M3/M6 hybrid).
2. **First-class `group` block.** Grouping/ordering uses a new `GroupBlock` (a titled
   section containing nested blocks), **one level of nesting** (a group's children are
   non-group blocks).
3. **Cross-links via section anchors.** `assemble` stamps `id="<block.id>"` on every
   block's `<section>`; the agent links related blocks by their id (`[label](#<id>)`).

## Architecture

### Tool enablers

**E1 — shared markdown helper.** Extract the marked-walkTokens-Shiki + sanitize-html
pipeline currently inside `src/renderers/prose.ts` into `src/renderers/markdown.ts`:
`renderMarkdown(md: string, onWarn?): Promise<string>` (returns sanitized inner HTML, no
wrapping `<section>`). `prose.ts` calls it. `sanitize-html`'s `allowedSchemes`
(http/https/mailto) does not strip *relative* hrefs, so fragment links like `#diff-x`
survive — verify a fragment link round-trips through `renderMarkdown`.

**E2 — prose title.** `renderProse` renders `block.title` as `<h2>${escapeHtml(title)}</h2>`
before the body when `title` is set (today it is ignored). Empty/absent title → no heading
(unchanged).

**E3 — `DiffBlock.description`.** Add `description?: string` (markdown) to `DiffBlock`.
`renderDiff` renders it via `renderMarkdown` into a `<div class="vs-diff-desc">…</div>`
placed **above** the hunks (after the path line). Absent → no callout. The description may
contain cross-links.

**E4 — section anchors.** `assemble` adds `id="<block.id>"` to each block's top-level
`<section>`. Implemented with a single `withAnchor(id, html)` helper that injects
`id="…"` into the leading `<section ` of a rendered fragment (every renderer emits
`<section class="vs-block …">`, so injection is uniform). Ids are already unique per
document (the existing dup-id guard covers diagram/schema; other block ids are
author/producer-assigned and unique).

**E5 — `GroupBlock`.** New union member:
```ts
export interface GroupBlock {
  type: "group";
  id: string;
  title: string;
  blocks: Block[];   // one level: children are non-group blocks
}
```
`assemble` changes:
- Refactor the per-block render into a `renderBlock(b): Promise<string>` function (closure
  over `svgById` + `opts`). `withAnchor` wraps each block's fragment.
- `case "group"`: render `<section class="vs-block vs-group"><h2>${escapeHtml(title)}</h2>`
  + the children each rendered via `renderBlock` + `</section>` (then `withAnchor`). A
  `group` nested inside a `group` throws (one level only) via the exhaustiveness path —
  i.e. the group case rejects a child of type `group` with a clear error.
- The up-front diagram render pass must collect diagrams **recursively**: a
  `collectDiagrams(blocks)` helper walks into groups so a diagram nested in a group is
  pre-rendered and present in `svgById`.
- The exhaustiveness `never` switch gains the `group` case.

**E6 — mechanical summary titled "Summary".** In `gather-recap`, the summary prose block is
created with `title: "Summary"` (the markdown body is unchanged; `summaryMarkdown` still
produces it). So even the bare CLI labels the summary.

### The skill upgrade — `skills/visual-recap/SKILL.md`

Rewrite the "Add context (smart enrichment)" section so, after `--emit-blocks`, the agent:
1. **Reads the diff AND the changed code** (opens the changed files to understand intent),
   not just the diff text.
2. **Rewrites the `summary` block** (keep `id: "summary"`, set `title: "Summary"`) into a
   real explanation of *what the change does and why* — the reasoning, the user-facing
   effect — not file/line stats.
3. **Annotates each diff** by setting its `description` (markdown: what changes in this file
   and why) and **cross-links related diffs** via their block id (`[league.ts](#<id>)`,
   using the ids present in the emitted JSON).
4. **Reorders and groups** the diff blocks into `group` blocks by importance and topic, so
   top-to-bottom reads as a narrative — e.g. *The core change* → *Supporting wiring* →
   *Tests & config*. Place the groups after the Summary, the where-it-fits diagram, and the
   behavioral diagram.
5. **Selects + authors a behavioral diagram** (sequence/state) as in M6 (kept).
6. Renders the combined array via `plan`.

The section also documents the new affordances: prose `title`, `DiffBlock.description`
(markdown + `#id` cross-links), and the `group` block shape.

## Data flow

`visual-recap` skill → `recap --emit-blocks blocks.json` (mechanical blocks incl. the
"Summary"-titled summary, where-it-fits, schema/api, diffs) → agent reads diff+code,
rewrites summary, sets each diff's `description` + cross-links, wraps diffs in ordered
`group` blocks, authors a behavioral diagram → `plan --blocks blocks.json --out <dir>` →
`assemble` renders groups (recursively), anchors, diff descriptions, prose titles → doc.

## Error handling

All additions degrade: a `DiffBlock` without `description` renders just hunks (today's
behavior); a prose block without `title` renders no heading; an empty `group` renders an
empty titled section; a cross-link to a missing id is a dead in-page link (harmless); a
nested `group` throws a clear error (caught nowhere new — it is an authoring error the agent
must not produce, and the guard/exhaustiveness surfaces it). Markdown in descriptions goes
through the same sanitizer as prose.

## Testing

- **markdown helper:** a fragment link `[x](#foo)` survives (href `#foo` retained); a
  `<script>`/`onclick`/`javascript:` is stripped; a Shiki-highlighted fence survives (the
  existing prose behaviors, now via the shared helper). `prose.test.ts` still passes.
- **prose title:** a prose block with `title:"Summary"` renders `<h2>Summary</h2>`; without
  a title renders no `<h2>`.
- **diff description:** a `DiffBlock` with a `description` containing a `[a](#b)` link
  renders a `vs-diff-desc` callout above the hunks with the link intact; without it, no
  callout; hunks/highlighting unchanged.
- **group:** `assemble` renders a `group` as a titled section containing its children; a
  diagram nested in a group is rendered (its `<svg>` present, via the recursive collect); a
  child's `id` anchor is present; a nested `group` (group-in-group) throws.
- **anchors:** every rendered block `<section>` carries `id="<block.id>"`.
- **mechanical summary:** the gathered summary block has `title: "Summary"` and renders the
  heading.
- **skill-docs guard:** extend to require `visual-plan/SKILL.md` documents the new `group`
  type (block-coverage guard) and that `visual-recap/SKILL.md` mentions `description`,
  `group`, and `Summary`.
- **assemble all-types:** a document containing a `group` (with a nested diagram + diff) and
  a titled prose block renders with no `<script>`, anchors present, group + children
  rendered.
- **Regression:** the ppgl recap (`--commit 3559f61`) still produces a self-contained doc;
  the bare CLI now titles the summary "Summary"; everything still renders, 0 placeholders.

## Risks

- **Nesting in `assemble`** (the diagram pre-render pass + exhaustiveness must recurse) —
  bounded to one level, covered by the group + nested-diagram tests.
- **Anchor injection uniformity** — every renderer emits `<section class="vs-block …">`, so
  the single `withAnchor` helper is reliable; a test asserts ids on every block type.
- **Agent output quality** depends on the agent actually reading code; the skill instructs
  this explicitly, and all enablers degrade gracefully when fields are absent.
- **Self-contained / no-view-time-JS** preserved: anchors and `#id` links are pure HTML; no
  scripts added.
