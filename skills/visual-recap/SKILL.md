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
