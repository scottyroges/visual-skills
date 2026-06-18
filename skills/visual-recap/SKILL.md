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

1. Emit the gathered blocks instead of HTML — write them **into the doc folder** (so the source
   stays grouped with the rendered doc), e.g. `<ABSOLUTE_OUT_DIR>/blocks.json`:

       cd "$VISUAL_SKILLS_DIR"
       npx tsx bin/recap.ts --repo <ABSOLUTE_TARGET_REPO> <target flag> --emit-blocks <ABSOLUTE_OUT_DIR>/blocks.json

2. **Read the diff AND the changed code.** Open the changed files in the target repo to
   understand *what the change does and why* — don't work from the diff text alone.

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

4. **Annotate each diff.** Set each diff block's `description` (markdown) to *what changes in
   this file and why*. Cross-link related diffs by their block id, which you can see in the
   emitted JSON, e.g. `See [the router](#diff-3).` (each block renders with `id="<its id>"`,
   so `#diff-3` jumps to that diff).

4b. **Illustrate a diff when it helps** (distinct from the top-level change diagram in step 6 —
   this one lives *inside* a single diff's card). When a single diff implements logic that's
   clearer shown than read — a new state machine, a non-obvious control/data flow, a sequence
   across collaborators — attach a small catalog diagram as that diff's `diagram`:

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

5. **Order and group the diffs.** Wrap the diff blocks in `group` blocks, ordered by
   importance, so reading top-to-bottom is a narrative — e.g. *The core change* →
   *Supporting wiring* → *Tests & config*. A group is
   `{ "type":"group", "id":"…", "title":"…", "blocks":[ …diff blocks… ] }` (one level deep —
   groups may not contain groups). Place the groups after the lead (the Summary or `overview`), the
   `where-it-fits` diagram, and the diagram(s).

6. **Author the diagram(s)** for the change — see "Which diagram(s) to add" below. Prefer one;
   use a `tabs` block when 2–3 lenses each add value. Place them near the top (after the lead
   Summary / `overview` and the where-it-fits graph).

7. Render the combined array (edited in place at `<ABSOLUTE_OUT_DIR>/blocks.json`) and open it. The
   render also writes `blocks.json` back into the folder, so the doc folder stays self-contained and
   re-renders in place:

       npx tsx bin/plan.ts --blocks <ABSOLUTE_OUT_DIR>/blocks.json --title "Recap — <label>" --out <ABSOLUTE_OUT_DIR>
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

Apply the catalog's **color vocabulary** — always mark the `changed` subject, and tag actors /
external systems / datastores by role so the diagram reads at a glance.

### Grouping multiple diagrams into tabs

A `tabs` block presents complementary views as a CSS-only switcher (no JS):

    { "type": "tabs", "id": "views", "title": "How it works", "tabs": [
      { "label": "Sequence",  "block": { "type": "diagram", "id": "seq", "title": "captureOrder flow", "kind": "sequence",
        "d2": "shape: sequence_diagram\nclient -> api: captureOrder(id)\napi -> paypal: capture(id)" } },
      { "label": "States",    "block": { "type": "diagram", "id": "states", "title": "Order states", "kind": "flowchart",
        "d2": "direction: right\nPENDING -> PAID: capture\nPENDING -> CANCELLED: cancel" } }
    ] }

Each tab holds ONE block (one level deep — a tab may not contain a `group` or another `tabs`).
Place the tabs near the top, after the lead (Summary or `overview`) and the `where-it-fits` diagram.

Tabs use a no-JS CSS switcher, so an inactive tab's panel is hidden until clicked. Keep
`#`-cross-link *targets* (e.g. a diff the lead links to) OUT of tabs — a jump to a block in an
inactive tab lands on a hidden panel. Put alternate *views* in tabs; keep linkable content in
groups or top-level blocks.
