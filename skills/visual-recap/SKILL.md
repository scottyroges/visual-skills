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

3. **Choose an output path** — default `<target-repo>/.recaps/<short-label>.html` (use an
   absolute path).

4. **Run the recap** from the tool directory so its dependencies resolve:

       cd "$VISUAL_SKILLS_DIR"
       npx tsx bin/recap.ts --repo <ABSOLUTE_TARGET_REPO> <target flag> --out <ABSOLUTE_OUT>

5. **Open it:** `open <ABSOLUTE_OUT>` on macOS, otherwise tell the user the path.

## Fallbacks

- **`--pr` fails / no `gh`:** the CLI prints "PR scope needs the gh CLI". Resolve the PR's
  merge or head commit SHA (e.g. via `gh`, the GitHub UI, or `git log`) and re-run with
  `--commit <sha>` instead.
- **`d2` missing:** diagrams degrade to visible placeholders (the recap still produces) —
  tell the user to `brew install d2` for proper hand-drawn sketches.
- Editable Excalidraw diagrams are an optional upgrade — see the tool's README
  (`npm run setup:excalidraw`). Without it, diagrams render as static D2 sketches.

## Example

Recap of a merged PR by its squash-merge SHA, into the target repo's `.recaps/`:

    cd "$VISUAL_SKILLS_DIR"
    npx tsx bin/recap.ts --repo /Users/me/Projects/ppgl --commit 3559f61 \
      --out /Users/me/Projects/ppgl/.recaps/pr-183.html
    open /Users/me/Projects/ppgl/.recaps/pr-183.html

## Add context (smart enrichment)

The bare recap already includes a summary and a "where it fits" dependency graph. To add a
behavioral view tailored to the change, enrich it:

1. Emit the gathered blocks instead of HTML:

       cd "$VISUAL_SKILLS_DIR"
       npx tsx bin/recap.ts --repo <ABSOLUTE_TARGET_REPO> <target flag> --emit-blocks <ABSOLUTE_BLOCKS_JSON>

2. Read that block array (it has the summary, file-tree, where-it-fits graph, schema/API,
   diffs) **and** read the actual diff. Optionally rewrite the `summary` prose block's
   `markdown` to explain *why* the change was made, not just what.

3. **Author ONE behavioral diagram** for the change (see the selection guide), and insert it
   into the array right after the `where-it-fits` block. Diagrams are `diagram` blocks with a
   `d2` source (the floor).

4. Render the combined array:

       npx tsx bin/plan.ts --blocks <ABSOLUTE_BLOCKS_JSON> --title "Recap — <label>" --out <ABSOLUTE_OUT>
       open <ABSOLUTE_OUT>

### Which behavioral diagram to pick

- **Sequence diagram** (`"kind": "sequence"`) — when the change adds or alters a
  multi-collaborator runtime path: a new request/response flow, an external integration call
  chain. Collaborators on lifelines, time downward, ONE scenario.
- **State machine** (`"kind": "architecture"`) — when the change alters a bounded lifecycle:
  statuses, subscription / checkout / signup stages — anything where an entity is in one of N
  states with labeled transitions.
- If the change is purely structural (no clear runtime flow or lifecycle), the "where it
  fits" graph already covers it — skip the behavioral diagram rather than force one.

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
