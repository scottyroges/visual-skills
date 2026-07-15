---
name: visual-recap
description: Use when the user asks to visualize, render, recap, or "make readable" a pull request, commit, branch, or git diff as a self-contained HTML review document. Covers PR recaps, commit/branch reviews, and working-tree diffs grounded in the real repo.
---

# Visual Recap

Turn a git target (PR, commit, branch, or working tree) into a single self-contained HTML
**review narrative** — and open it.

**The deliverable is a guided narrative, never a bare pile of diffs.** A reviewer (the author
self-reviewing, or a cold teammate with zero context) must grasp *what changed, why, and where the
risk is* in ~10 seconds, then be walked through the change in a deliberate order. The raw output of
the gather step is **raw material, not the deliverable** — you are not done until it has been
enriched and re-rendered.

**Tool location** (edit if the repo moves):

    VISUAL_SKILLS_DIR=/home/srogener/visual-skills

## The standard — definition of done

A finished recap **always** has, regardless of change size:

- **An authored title** — `Recap — <human label>`, not `Recap — commit <sha>`.
- **A lead `overview` block, placed FIRST** — `headline` + TL;DR `facets` (what / why / size) +
  `risk` (level + note). This populates the TL;DR card and the topbar risk chip —
  the 10-second orientation. This is required even for a one-file fix.
- **Every non-trivial diff annotated** — a bold one-line takeaway + 2–5 bullets. Omit the
  description *only* for a genuinely trivial one-or-two-line change.
- **A deliberate order**, and — once there is more than a couple of diffs — diffs **grouped** into
  a narrative (e.g. *core change → supporting wiring → tests/config*), each group with a
  `description`.
- **At least one authored diagram** when behavior or structure is clearer shown than read.

**Size scales the ceiling, it never lowers the floor.** A small change gets fewer overview points
and maybe no diagram — but it still gets the headline, the what/why/size facets, the risk chip, and
per-diff annotations. See "Scaling by size" below.

### Red flags — you stopped too early

If any of these is true, the recap is **not done** — keep going:

- `blocks.json` is empty, or is still the gathered blocks with no `overview` and no `description`s.
- The title is still `Recap — commit <sha>` / `Recap — <branch>`.
- There is no `overview` block, or its `facets`/`risk` are unset.
- Diff cards have no `description`.
- You ran only `--out` (the one-shot bare render) and opened that. That output is raw material.
- The tool printed warnings about a missing overview, incomplete TL;DR, unannotated diffs, an
  ungrouped pile of diffs, or a wall-of-text description. **Those warnings mean below standard —
  fix `blocks.json` and re-render until they are gone.**

## Workflow (one required path)

1. **Identify** the target repo (default: cwd), what to recap, and the output folder (`--out` is a
   *directory*, e.g. `<target-repo>/.visual/recaps/<short-label>`, absolute path). Pick the target flag:
   - a pull request → `--pr <number>` (needs the `gh` CLI)
   - a commit/SHA/tag → `--commit <ref>`
   - a branch → `--branch <name>` (optionally `--base <ref>`)
   - uncommitted working changes → no target flag

2. **Gather the raw blocks into `blocks.json`** — this is raw material, *not* the deliverable:

       cd "$VISUAL_SKILLS_DIR"
       npx tsx bin/recap.ts --repo <ABSOLUTE_TARGET_REPO> <target flag> --emit-blocks <ABSOLUTE_OUT_DIR>/blocks.json

3. **Read the diff AND the changed code.** Open the changed files in the target repo to understand
   *what the change does and why* — do not work from the diff text alone.

4. **Author the lead `overview` block, placed FIRST** (step detail below). Always fill `headline`,
   `facets` (what/why/size), and `risk`.

5. **Annotate every non-trivial diff** as a bold takeaway + bullets (step detail below).

6. **Order and group the diffs** into a narrative (step detail below).

7. **Author the diagram(s)** for the change (see "Which diagram(s) to add").

8. **Render and open.** This writes `recap.html` (and re-writes `blocks.json`) back into the folder,
   so the doc folder stays self-contained and re-renders in place:

       npx tsx bin/recap.ts --blocks <ABSOLUTE_OUT_DIR>/blocks.json --title "Recap — <label>" --out <ABSOLUTE_OUT_DIR>
       open <ABSOLUTE_OUT_DIR>/recap.html

9. **Read the tool's warnings and close them.** The renderer lints the blocks and prints warnings
   for anything below standard (missing overview, incomplete TL;DR/risk, unannotated diffs, an
   ungrouped pile, wall-of-text). Edit `blocks.json` and re-run step 8 until the render is clean.

## Scaling by size

The floor is the same for everyone; only the ceiling moves.

| Element | Small (1–2 files) | Medium | Large (many files, schema/API) |
|---|---|---|---|
| `overview` headline + facets + risk | **required** | **required** | **required** |
| overview `points` | 1–3 | 3–5 | 4–6, keyword-linked |
| per-diff `description` (bullets) | **required** (unless truly trivial) | **required** | **required** |
| `group` blocks | optional (often one group, or none) | **yes** | **yes**, ordered as a narrative |
| lead diagram | optional | usually | **yes** |
| per-diff diagram | rare | when it clarifies | where logic is clearer shown |

A one-file fix is still a finished review: an `overview` with a one-line what/why/size + risk, and a
bulleted annotation on the diff. It is never just the bare diff.

## Step detail

### 4 — Author the lead `overview` block (FIRST)

A scannable lead the reader groks in seconds:

    { "type": "overview", "id": "overview",
      "headline": "Add PayPal capture to the checkout flow",
      "points": [
        { "text": "new `capture` mutation on the [order router](#diff-0)" },
        { "text": "checkout calls it after buyer [approval](#diff-1)" }
      ],
      "facets": { "what": "Capture funds when the buyer approves", "why": "Orders were authorized but never charged", "size": "8 files, ~154 runtime lines" },
      "risk": { "level": "low", "note": "additive; no schema changes" },
      "diagram": { "type": "diagram", "id": "ov-flow", "title": "Capture flow", "kind": "sequence",
        "d2": "shape: sequence_diagram\nclient -> api: capture\napi -> paypal: capture",
        "mermaid": "sequenceDiagram\n  client->>api: capture\n  api->>paypal: capture" } }

- `headline`: the main change in ONE line.
- `points`: SHORT items (count scales with size — see the table). Link a **keyword** inline with
  markdown to its detail section, e.g. `new \`capture\` mutation on the [order router](#diff-0)` —
  do NOT rely on a bare `href` that turns the whole bullet into one link (a keyword link reads far
  better).
- `facets` / `risk`: **always set these** — they populate the TL;DR card (What / Why / Risk / Size)
  and the topbar risk chip.
  - `facets`: `{ "what": "…one line…", "why": "…one line…", "size": "…e.g. 8 files, ~154 runtime lines…" }`
  - `risk`: `{ "level": "low" | "med" | "high", "note": "…why, e.g. additive, no schema changes…" }`
- `diagram` (optional, scales with size): the single most illuminating illustration (often the
  `where-it-fits` graph or the key behavioral diagram). Carry its `mermaid` to stay editable; don't
  point a `href` at a diagram hidden in a non-default tab.

For a very small change you may keep the `points` list short and drop the `diagram`, but the
`headline`, `facets`, and `risk` are still required.

### 5 — Annotate each diff (bullets, not a paragraph)

Set a diff block's `description` to **markdown that leads with a one-line bold takeaway, then 2–5
`-` bullets** of the specific changes, with inline `code` for identifiers. A multi-sentence
paragraph (≈300+ chars of prose) is a FAILURE — break it into bullets. **Omit the description only
for a genuinely trivial one-or-two-line change.** The code hunks are collapsed by default under a
"View changes" toggle, so the description is the primary read — make it carry the meaning.

Author every description in this shape (note the literal `\n` and `- ` bullets in the JSON string):

    "description": "**Two new queries — the data foundation.**\n\n- `findStandings` joins members → picks → results, so a member who didn't pick still yields a row\n- ordered by earnings DESC, then a stable tiebreak\n- `countStandings` counts active members — the pagination denominator\n\nConsumed by [the service](#diff-service)."

❌ Do NOT write it as one run-on string: `"Two new queries. findStandings joins members to picks to
results so a member who didn't pick still yields a row, ordered by earnings desc… and countStandings
counts active members which is the denominator…"` — that is the wall of text this format exists to
prevent.

Cross-link related diffs by id, e.g. `[the router](#diff-router)` (each block renders with
`id="<its id>"`, so `#diff-router` jumps to that diff).

**Illustrate a diff when it helps** (distinct from the top-level change diagram — this one lives
*inside* a single diff's card). When a single diff implements logic that's clearer shown than read —
a new state machine, a non-obvious control/data flow, a sequence across collaborators — attach a
small catalog diagram as that diff's `diagram`:

    "diagram": { "type": "diagram", "id": "diff-3-diag", "title": "Capture flow", "kind": "sequence",
      "d2": "shape: sequence_diagram\napi -> paypal: capture(id)\npaypal -> api: ok",
      "mermaid": "sequenceDiagram\n  api->>paypal: capture(id)\n  paypal-->>api: ok" }

- **Restraint:** most diffs need none — attach one only when it adds understanding the code alone
  doesn't.
- **Keep it editable:** copy the catalog recipe *including its `mermaid` sibling* for any
  editable-eligible kind (flowchart/architecture/sequence/class), so the diagram renders as an
  editable Excalidraw scene; a d2-only diagram forfeits that (ERD stays d2-only by design).
- **Multiple views:** if one diff genuinely needs more than one diagram, set `diagram` to a `tabs`
  block of diagrams instead (default to a single diagram). A diagram inside a non-default tab is
  hidden until clicked, so don't make it a `#cross-link` target.
- A `group` of diffs can likewise lead with a `diagram` (or a `tabs`) block to illustrate the whole
  grouping.

### 6 — Order and group the diffs

Order the diffs so reading top-to-bottom is a narrative. Once there is more than a couple of diffs,
wrap them in `group` blocks, ordered by importance — e.g. *The core change* → *Supporting wiring* →
*Tests & config*. **Every group MUST include a `description`** (markdown, one or two scannable lines
on what the group covers and why it matters):

    { "type": "group", "id": "grp-core", "title": "The core change — query, shape, expose",
      "description": "The SQL query, the service that guards and shapes it, and the tRPC procedure that exposes it.",
      "blocks": [ …diff blocks… ] }

(One level deep — groups may not contain groups.) Place the groups after the lead `overview`, the
`where-it-fits` diagram, and the diagram(s).

Within each group, order the diffs **most-important-first** (the core logic change before its
supporting wiring; styles, tests, config, and lockfiles last). The gather step already applies this
ordering heuristically, but when you regroup, preserve importance order inside each group — never
lead a group with a stylesheet or test file.

For a 1–2 file change, grouping is optional (a single group, or none) — but the `overview` and the
per-diff annotations are not.

## Fallbacks

- **`--pr` fails / no `gh`:** the CLI prints "PR scope needs the gh CLI". Resolve the PR's merge or
  head commit SHA (e.g. via `gh`, the GitHub UI, or `git log`) and re-run with `--commit <sha>`.
- **`d2` missing:** diagrams degrade to visible placeholders (the recap still produces) — tell the
  user to `brew install d2` for proper rendered diagrams.
- **d2 vs Excalidraw:** diagrams render as static D2 images by default and stay that way unless you
  opt in. Pass **`--excalidraw`** to promote editable-eligible diagrams to `.excalidraw` scenes
  (requires the `npm run setup:excalidraw` toolchain); without it — or with `--no-excalidraw` — you
  get the static D2 floor (no sidecars).

## Which diagram(s) to add

Consult the shared **diagram catalog** for the full selection guide and tested recipes:

    $VISUAL_SKILLS_DIR/skills/shared/diagrams.md

Prefer the fewest diagrams that explain the change — often ONE. The catalog's *Behavior* and
*Journey* lenses cover most recaps (a sequence for a new runtime path; a state machine for a
lifecycle change). When 2–3 lenses each add distinct value (e.g. a sequence AND a data-flow),
present them in a `tabs` block instead of forcing one.

**The mechanical `where-it-fits` import graph is rough orientation, not a deliverable.** It is a
de-noised dependency graph the gather step produces automatically; it rarely tells a story. For any
change with a clear architectural home, **replace it with a curated *Feature home* diagram** (see the
catalog) — the changed pieces in their layer/stack (router → service → repository → datastore), with
reused existing modules called out and library/test noise dropped. Keep the same `id`
(`where-it-fits`) so it lands in the structural slot. Only for a small, single-file change with no
meaningful layering is a structural diagram unnecessary — then drop it rather than ship the raw graph.

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

Each tab holds ONE block (one level deep — a tab may not contain a `group` or another `tabs`). Place
the tabs near the top, after the lead `overview` and the `where-it-fits` diagram.

Tabs use a no-JS CSS switcher, so an inactive tab's panel is hidden until clicked. Keep
`#`-cross-link *targets* (e.g. a diff the lead links to) OUT of tabs — a jump to a block in an
inactive tab lands on a hidden panel. Put alternate *views* in tabs; keep linkable content in groups
or top-level blocks.

## Example

    cd "$VISUAL_SKILLS_DIR"
    # 1–2. gather raw blocks (raw material, not the deliverable)
    npx tsx bin/recap.ts --repo /Users/me/Projects/ppgl --commit 3559f61 \
      --emit-blocks /Users/me/Projects/ppgl/.visual/recaps/pr-183/blocks.json
    # 3–7. read the code; edit blocks.json — add the overview, annotate diffs, group, diagram
    # 8. render + open
    npx tsx bin/recap.ts --blocks /Users/me/Projects/ppgl/.visual/recaps/pr-183/blocks.json \
      --title "Recap — estimated purse" --out /Users/me/Projects/ppgl/.visual/recaps/pr-183
    open /Users/me/Projects/ppgl/.visual/recaps/pr-183/recap.html
    # 9. fix any warnings the render printed, then re-render
