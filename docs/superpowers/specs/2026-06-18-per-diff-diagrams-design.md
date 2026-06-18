# Per-Diff Diagrams — Design

**Date:** 2026-06-18
**Status:** Approved (brainstorming)

## Goal

Let the `visual-recap` agent attach a single illustrative diagram to an individual diff, so a
review narrative can show *how a specific change works* (a new state machine, a non-obvious
control/data flow, a cross-collaborator sequence) — not just the top-level architecture diagrams.
Groupings of diffs already compose with diagrams via the existing `group` block (a `group` renders
its children in order, so `[diagram, diff, diff]` puts a diagram atop the group); this design adds
the missing per-diff case.

## Background

- `DiffBlock` today: `{ type, id, title, path, description?, hunks }`. `renderDiff` renders the
  title, path, optional markdown `description`, then the hunks (`src/renderers/diff.ts`).
- Diagrams are compiled to SVG **up front** in `assemble` (`collectDiagrams` gathers every
  diagram/schema block — recursing into `group`/`tabs` — and `renderAll` compiles them into an
  `svgById` map). `renderBlock`'s `case "diagram"` then just looks up the pre-rendered SVG. The
  d2 binary is never invoked from inside an individual renderer.
- `assertUniqueIds` enforces globally-unique block ids (recursing into `group`/`tabs`); anchors,
  in-page `#cross-links`, and per-diagram `<id>.excalidraw` sidecar filenames depend on it.

## Decisions (locked during brainstorming)

1. **First-class on the diff.** Add an optional `diagram` to `DiffBlock`; it renders inside that
   diff's card. (Not pure composition, not group-wrapping.)
2. **One diagram per diff** (YAGNI). A diff needing multiple views uses a `group` + `tabs`.
3. **Placement: after the `description`, above the hunks** — grasp the change, then read the code.
4. **d2 compilation stays in assemble's up-front pass** — `renderDiff` never compiles d2.
5. **Hybrid split unchanged.** The bare recap CLI leaves `diagram` unset (it cannot judge which
   diffs warrant one); the agent fills it during enrichment, like Summary/descriptions/groups.

## Component 1 — Type

In `src/blocks.ts`, add an optional field to `DiffBlock`:

```ts
export interface DiffBlock {
  type: "diff";
  id: string;
  title: string;
  path: string;
  description?: string;  // optional markdown "what & why", rendered above the hunks
  diagram?: DiagramBlock; // optional illustration, rendered after the description, above the hunks
  hunks: DiffHunk[];
}
```

`DiagramBlock` is already declared in the same file. Reusing it means per-diff diagrams get the
M8 catalog recipes and the Excalidraw-editable path for free (own id/title/kind/d2/optional mermaid).

## Component 2 — Rendering

**Extract a shared helper in `src/assemble.ts`.** The current `case "diagram"` / `case "schema"`
builds `r.svg` + an optional "open in Excalidraw" link inside a `<section>`. Factor the inner part
out so the diff embed can reuse it without the section wrapper:

```ts
// svg + optional editable link, without the outer <section> — reused by diagram blocks and
// by diagrams embedded inside a diff.
const diagramInner = (r: { svg: string; editable: string | null }): string => {
  const link = r.editable
    ? `<div class="vs-edit"><a href="${escapeHtml(basename(r.editable))}">open in Excalidraw</a></div>`
    : "";
  return `${r.svg}${link}`;
};
```

- `case "diagram"` / `case "schema"`: becomes
  `<section class="vs-block vs-diagram"><h2>${title}</h2>${diagramInner(r)}</section>`.
- `case "diff"`: if `b.diagram` is present, look up its pre-rendered result and build the embed,
  then pass it into `renderDiff`:

  ```ts
  case "diff": {
    let diagramHtml = "";
    if (b.diagram) {
      const r = svgById.get(b.diagram.id)!;
      diagramHtml = `<div class="vs-diff-diagram"><h3>${escapeHtml(b.diagram.title)}</h3>${diagramInner(r)}</div>`;
    }
    html = await renderDiff(b, opts.onWarn, diagramHtml);
    break;
  }
  ```

**`renderDiff` signature gains a third optional arg** (keeps existing callers/tests working):

```ts
export async function renderDiff(
  block: DiffBlock,
  onWarn?: (msg: string) => void,
  diagramHtml = "",
): Promise<string>
```

It inserts `diagramHtml` between `desc` and the hunks. `renderDiff` stays free of any d2/SVG
compilation — it only places a pre-rendered HTML fragment.

## Component 3 — Collection & uniqueness recursion

In `src/assemble.ts`, both recursive walkers gain a `diff.diagram` case (they already handle
`group`/`tabs`):

- `collectDiagrams`: `else if (b.type === "diff" && b.diagram) out.push(b.diagram);` — so the
  embedded diagram is compiled in the up-front pass and (when eligible) writes its `.excalidraw`
  sidecar, exactly like a standalone diagram.
- `assertUniqueIds`: `else if (b.type === "diff" && b.diagram) assertUniqueIds([b.diagram], seen);`
  — so an embedded diagram's id must be globally unique (it shares the same anchor/sidecar namespace).

## Component 4 — CSS

In `assets/template.css`, add `.vs-diff-diagram` styling consistent with the existing
`.vs-diff-desc` (spacing above/below; a smaller `<h3>` caption). The embedded SVG inherits the
existing diagram svg sizing rules.

## Component 5 — Skill guidance (visual-recap)

In `skills/visual-recap/SKILL.md`, extend the enrichment guidance:

- **Per-diff diagrams:** when a single diff implements logic that's clearer shown than read — a new
  state machine, a non-obvious control/data flow, a sequence across collaborators — author a small
  catalog diagram and set it as the diff's `diagram`. Show the JSON shape
  (`"diagram": { "type": "diagram", "id": "...", "kind": "...", "d2": "..." }` inside a diff block).
- **Restraint:** most diffs need no diagram; attach one only when it adds understanding the code
  alone doesn't. One per diff.
- **Grouping-level diagrams:** a `group` may lead with a diagram block to illustrate a whole
  grouping of diffs (already supported — no new field).
- Embedded diagrams render inline (not inside a tab), so they are safe `#cross-link` targets; the
  diff `description` may link to the diagram by id.

## Component 6 — Testing

- **`test/diff.test.ts`:** `renderDiff(block, undefined, "<div class='vs-diff-diagram'>DIAG</div>")`
  places the fragment after the `description` and before the first hunk; `renderDiff(block)` (no
  third arg) is byte-unchanged from today.
- **`test/assemble.test.ts`:** a `diff` with a `.diagram` renders the diagram's real `<svg>` inside
  the `vs-diff` section (no "failed to render" placeholder) — proving `collectDiagrams` included it
  in the up-front pass; `assertUniqueIds` throws when a diff's embedded `diagram.id` duplicates
  another block's id.
- **`test/skill-docs.test.ts`:** assert `recapSkill` documents the per-diff diagram (e.g. contains
  `"diagram":`).

## Out of scope

- Multiple diagrams per diff (use a `group` + `tabs`).
- Auto-generating per-diff diagrams in the bare CLI (it stays mechanical).
- New diagram kinds (the M8 catalog already covers the vocabulary).

## Implementation sequencing (small commits)

1. `DiffBlock.diagram` type + `collectDiagrams`/`assertUniqueIds` recursion.
2. `diagramInner` extraction + `renderDiff` third arg + `case "diff"` embed + CSS.
3. Skill guidance + skill-docs test.
