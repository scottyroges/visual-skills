---
name: visual-recap
description: Use when the user asks to visualize, render, or "make readable" a pull request, commit, branch, or git diff as a self-contained HTML recap. Produces a hand-drawn-styled HTML document grounded in the real repo — file tree, Prisma schema changes, tRPC API-surface diagram, and syntax-highlighted diffs.
---

# Visual Recap

Turn a git target (PR, commit, branch, or working tree) into a single self-contained,
hand-drawn-styled HTML document and open it.

**Tool location** (edit if the repo moves):

    VISUAL_SKILLS_DIR=/Users/scottrogener/Projects/visual-skills

## Steps

1. **Identify the target repo.** Default to the current working directory. If the user
   names another repo, use its absolute path.

2. **Identify what to recap** and pick the matching flag:
   - a pull request → `--pr <number>` (needs the `gh` CLI)
   - a commit/SHA/tag → `--commit <ref>`
   - a branch → `--branch <name>` (optionally `--base <ref>` to set the comparison base)
   - uncommitted working changes → no target flag

3. **Choose an output folder** — `--out` is a *directory*, e.g.
   `<target-repo>/.recaps/<short-label>` (use an absolute path). The HTML (`recap.html`)
   and any editable `.excalidraw` sidecars are written together inside it.

4. **Run the recap** from the tool directory so its dependencies resolve:

       cd "$VISUAL_SKILLS_DIR"
       npx tsx bin/recap.ts --repo <ABSOLUTE_TARGET_REPO> <target flag> --out <ABSOLUTE_OUT_DIR>

5. **Open it:** `open <ABSOLUTE_OUT_DIR>/recap.html` on macOS, otherwise tell the user the path.

## Fallbacks

- **`--pr` fails / no `gh`:** the CLI prints "PR scope needs the gh CLI". Resolve the PR's
  merge or head commit SHA (e.g. via `gh`, the GitHub UI, or `git log`) and re-run with
  `--commit <sha>` instead.
- **`d2` missing:** diagrams degrade to visible placeholders (the recap still produces) —
  tell the user to `brew install d2` for proper hand-drawn sketches.
- Editable Excalidraw diagrams are an optional upgrade — see the tool's README
  (`npm run setup:excalidraw`). Without it, diagrams render as static D2 sketches.

## Example

Recap of a merged PR by its squash-merge SHA, into a per-PR folder under `.recaps/`:

    cd "$VISUAL_SKILLS_DIR"
    npx tsx bin/recap.ts --repo /Users/me/Projects/ppgl --commit 3559f61 \
      --out /Users/me/Projects/ppgl/.recaps/pr-183
    open /Users/me/Projects/ppgl/.recaps/pr-183/recap.html

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
   diagram, and the diagram(s).

6. **Author the diagram(s)** for the change — see "Which diagram(s) to add" below. Prefer one;
   use a `tabs` block when 2–3 lenses each add value. Place them near the top (after the Summary
   / where-it-fits).

7. Render the combined array and open it:

       npx tsx bin/plan.ts --blocks <ABSOLUTE_BLOCKS_JSON> --title "Recap — <label>" --out <ABSOLUTE_OUT_DIR>
       open <ABSOLUTE_OUT_DIR>/plan.html

### Which diagram(s) to add

Consult the shared **diagram catalog** for the full selection guide and tested recipes:

    $VISUAL_SKILLS_DIR/skills/shared/diagrams.md

Prefer the fewest diagrams that explain the change — often ONE. The catalog's *Behavior* and
*Journey* lenses cover most recaps (a sequence for a new runtime path; a state machine for a
lifecycle change). When 2–3 lenses each add distinct value (e.g. a sequence AND a state machine,
or the `where-it-fits` graph AND a data-flow), present them in a `tabs` block instead of forcing
one. If the change is purely structural, the mechanical `where-it-fits` graph may already be
enough — skip adding more.

Use the catalog's recipes verbatim (they are compile-tested), substituting real identifiers.

### Grouping multiple diagrams into tabs

A `tabs` block presents complementary views as a CSS-only switcher (no JS):

    { "type": "tabs", "id": "views", "title": "How it works", "tabs": [
      { "label": "Sequence",  "block": { "type": "diagram", "id": "seq", "title": "captureOrder flow", "kind": "sequence",
        "d2": "shape: sequence_diagram\nclient -> api: captureOrder(id)\napi -> paypal: capture(id)" } },
      { "label": "States",    "block": { "type": "diagram", "id": "states", "title": "Order states", "kind": "flowchart",
        "d2": "direction: right\nPENDING -> PAID: capture\nPENDING -> CANCELLED: cancel" } }
    ] }

Each tab holds ONE block (one level deep — a tab may not contain a `group` or another `tabs`).
Place the tabs near the top, after the Summary and the `where-it-fits` diagram.

Tabs use a no-JS CSS switcher, so an inactive tab's panel is hidden until clicked. Keep
`#`-cross-link *targets* (e.g. a diff a Summary links to) OUT of tabs — a jump to a block in an
inactive tab lands on a hidden panel. Put alternate *views* in tabs; keep linkable content in
groups or top-level blocks.
