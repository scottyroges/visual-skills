---
name: visual-plan
description: Use when the user asks to turn a spec, plan, or design markdown into a self-contained, visually readable HTML document grounded in the real codebase — with diagrams, a file tree, annotated code, and open questions.
---

# Visual Plan

Turn a spec/plan into a single self-contained, hand-drawn-styled HTML document by authoring
a typed block array and rendering it. Unlike the recap (which is automatic), you compose the
blocks — so ground every reference in the real repo.

**Tool location** (edit if the repo moves):

    VISUAL_SKILLS_DIR=/Users/scottrogener/Projects/visual-skills

## Steps

1. **Read the source** spec/plan (the file the user names, or the plan already in context).
2. **Read the authoritative schema:** `$VISUAL_SKILLS_DIR/src/blocks.ts`. It defines the
   `Block` union — treat it as the source of truth for field names and shapes.
3. **Ground it in the real repo:** use real file paths, Prisma model names, and tRPC
   router/procedure names from the target codebase. Do not invent identifiers.
4. **Author a `Block[]` JSON array** using the mapping below.
5. **Render it** from the tool directory:

       cd "$VISUAL_SKILLS_DIR"
       npx tsx bin/plan.ts --blocks <ABSOLUTE_BLOCKS_JSON> --title "<Title>" \
         --source "<source path or label>" --out <ABSOLUTE_OUT_DIR>

   `--out` is a *directory*; the HTML (`plan.html`) and any `.excalidraw` sidecars are
   written together inside it.

6. **Open it:** `open <ABSOLUTE_OUT_DIR>/plan.html` (macOS), else report the path.

## Content -> block mapping

For diagram selection (which structural / boundary / data-flow / behavioral diagram to use) and
compile-tested recipes, consult the shared catalog: `$VISUAL_SKILLS_DIR/skills/shared/diagrams.md`.

Color diagrams with the catalog's semantic palette (the "Color vocabulary" section) — mark the
`changed`/subject node and tag actors / external systems / datastores by role.

Primary blocks you author for plans:

- **narrative / sections -> `prose`** (Markdown; GitHub-flavored). A fenced `mermaid`
  flowchart inside prose is auto-promoted to a diagram (and becomes editable if the
  Excalidraw upgrade is installed).

      { "type": "prose", "id": "overview", "markdown": "## Overview\n\nWhat & why..." }

- **architecture / flow -> `diagram`** — `d2` is required (the rendering floor); add
  `mermaid` for the editable upgrade on `flowchart`/`architecture` kinds. Quote any d2
  key/value containing a dot or space.

      { "type": "diagram", "id": "flow", "title": "Request flow", "kind": "flowchart",
        "d2": "direction: down\n\"client\" -> \"api\" -> \"db\"",
        "mermaid": "graph TD\nclient-->api-->db" }

- **affected / new files -> `file-tree`** — `status` is one of `A`/`M`/`D`/`R`.

      { "type": "file-tree", "id": "files", "title": "Files", "files": [
        { "path": "src/server/routers/league.ts", "status": "M", "added": 20, "deleted": 4 } ] }

- **key code to explain -> `annotated-code`** — per-line notes; use for the 2-3 most
  important snippets, not everything. `line` is 1-based.

      { "type": "annotated-code", "id": "capture", "title": "captureOrder", "lang": "ts",
        "code": "const order = await paypal.capture(id);\nreturn order;",
        "annotations": [ { "line": 1, "note": "server-side capture" } ] }

- **open decisions -> `questions`**

      { "type": "questions", "id": "open", "title": "Open questions", "questions": [
        { "question": "Refund window?", "recommendedDefault": "30 days" } ] }

- **grouping -> `group`** — a titled, collapsible set of related blocks; add an optional `description`
  (markdown) summarizing what the group covers. Shape: `{ "type":"group", "id":"…", "title":"…", "blocks":[ … ] }` (one level deep). Used mainly by recaps to order diffs into a
  narrative; available for plans too.

- **multiple views of one thing -> `tabs`** — a CSS-only tab switcher (no JS) presenting
  complementary diagrams as switchable panels. Each tab holds ONE block, one level deep (a tab
  may not contain a `group` or another `tabs`).

      { "type": "tabs", "id": "views", "title": "Two views", "tabs": [
        { "label": "Flow", "block": { "type": "diagram", "id": "v-flow", "title": "Flow", "kind": "flowchart", "d2": "a -> b" } },
        { "label": "Seq",  "block": { "type": "diagram", "id": "v-seq", "title": "Seq", "kind": "sequence", "d2": "shape: sequence_diagram\na -> b: hi" } } ] }

- **lead summary -> `overview`** — a scannable callout placed first: a one-line `headline`, short
  `points` (each `href` linking to a section by `#id`), and an optional lead `diagram`
  (`DiagramBlock` or `tabs`) rendered before the points. Author it for larger plans.

      { "type": "overview", "id": "overview", "headline": "Add PayPal capture",
        "points": [ { "text": "new `capture` [route](#flow)" } ],
        "diagram": { "type": "diagram", "id": "ov-flow", "title": "Flow", "kind": "flowchart", "d2": "a -> b" } }

Other block types in the `Block` union — `schema`, `api`, `diff` — are normally produced
automatically by the **visual-recap** flow from a real git diff, not hand-authored. Reach
for visual-recap when the subject is a code change rather than a plan.

## Notes

- Block `id`s must be unique across the document.
- Keep d2 valid: quote keys/values with dots (e.g. `"league.captureOrder"`). If d2 fails to
  compile, that block renders a visible placeholder rather than breaking the document.
- Diagrams need `d2` on PATH (`brew install d2`); without it they show placeholders.

## Example

    cd "$VISUAL_SKILLS_DIR"
    npx tsx bin/plan.ts --blocks /tmp/plan-blocks.json --title "Payments migration" \
      --source docs/specs/payments.md --out /tmp/payments-plan
    open /tmp/payments-plan/plan.html
